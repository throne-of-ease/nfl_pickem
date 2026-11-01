-- Admin confidence overrides may reclaim any rank. If another pick currently owns
-- that rank, swap it to the edited game's previous rank. This also works when the
-- other pick is still private: its team and identity are never returned to admin.
create or replace function public.admin_replace_picks(p_user_id uuid, p_pool_key text, p_picks jsonb)
returns jsonb language plpgsql security definer set search_path=public, auth as $$
declare
  current_revision bigint;
  game_count integer;
  submitted_games integer;
  distinct_games integer;
  submitted_count integer;
  distinct_count integer;
  visible_picks jsonb;
  change_rec record;
  old_confidence integer;
  occupied_game_id text;
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from profiles where id=p_user_id and not is_admin) then raise exception 'UNKNOWN_PLAYER'; end if;
  if not exists(select 1 from pools where key=p_pool_key) then raise exception 'UNKNOWN_POOL'; end if;
  if p_picks is null or jsonb_typeof(p_picks)<>'array' or jsonb_array_length(p_picks)=0 then raise exception 'INVALID_PICKS'; end if;

  select count(*), count(distinct "gameId"), count(confidence), count(distinct confidence)
    into submitted_games, distinct_games, submitted_count, distinct_count
    from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer);
  if submitted_games<>distinct_games or submitted_count<>distinct_count then raise exception 'INVALID_CONFIDENCE_SET'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text) left join games g on g.id=x."gameId" and g.pool_key=p_pool_key where g.id is null) then raise exception 'UNKNOWN_GAME'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text) join games g on g.id=x."gameId" where g.locked_at is null and g.kickoff>now()) then raise exception 'GAME_NOT_LOCKED'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text) join games g on g.id=x."gameId" where x.team is not null and x.team not in (g.away_team,g.home_team)) then raise exception 'INVALID_TEAM'; end if;
  select count(*) into game_count from games where pool_key=p_pool_key;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x(confidence integer) where confidence is not null and confidence not between 1 and game_count) then raise exception 'INVALID_CONFIDENCE_SET'; end if;

  -- Share the draft lock with normal player saves so the whole override is atomic.
  insert into drafts(user_id,pool_key) values(p_user_id,p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id=p_user_id and pool_key=p_pool_key for update;

  -- Process the patch as rank moves. Reusing an occupied confidence is always
  -- allowed for admins: the occupant receives the edited game's previous rank.
  -- Setting the target confidence to null first avoids the unique-index conflict.
  for change_rec in
    select x."gameId" as game_id, x.team, x.confidence
    from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer)
  loop
    select pk.confidence into old_confidence
      from picks pk
      where pk.user_id=p_user_id and pk.pool_key=p_pool_key and pk.game_id=change_rec.game_id;

    occupied_game_id := null;
    if change_rec.confidence is not null and change_rec.confidence is distinct from old_confidence then
      select pk.game_id into occupied_game_id
        from picks pk
        where pk.user_id=p_user_id and pk.pool_key=p_pool_key
          and pk.confidence=change_rec.confidence
          and pk.game_id<>change_rec.game_id
        limit 1;
    end if;

    update picks set confidence=null
      where user_id=p_user_id and pool_key=p_pool_key and game_id=change_rec.game_id;

    if occupied_game_id is not null then
      update picks set confidence=old_confidence
        where user_id=p_user_id and pool_key=p_pool_key and game_id=occupied_game_id;
    end if;

    insert into picks(user_id,pool_key,game_id,team,confidence)
      values(p_user_id,p_pool_key,change_rec.game_id,change_rec.team,change_rec.confidence)
      on conflict(user_id,pool_key,game_id) do update
        set team=excluded.team, confidence=excluded.confidence;
  end loop;

  update drafts set revision=revision+1, updated_at=now()
    where user_id=p_user_id and pool_key=p_pool_key returning revision into current_revision;
  insert into admin_audit(admin_id,action,target)
    values(auth.uid(),'admin_replace_picks',jsonb_build_object('userId',p_user_id,'poolKey',p_pool_key,'picks',p_picks));
  select coalesce(jsonb_agg(jsonb_build_object('gameId',pk.game_id,'team',pk.team,'confidence',pk.confidence) order by g.kickoff,g.id),'[]'::jsonb)
    into visible_picks from picks pk join games g on g.id=pk.game_id
    where pk.user_id=p_user_id and pk.pool_key=p_pool_key and (g.locked_at is not null or g.kickoff<=now());
  return jsonb_build_object('draftRevision',current_revision,'picks',visible_picks,
    'pickCount', (select count(*) from picks where user_id=p_user_id and pool_key=p_pool_key and team is not null));
end $$;
revoke all on function public.admin_replace_picks(uuid,text,jsonb) from public, anon;
grant execute on function public.admin_replace_picks(uuid,text,jsonb) to authenticated;
