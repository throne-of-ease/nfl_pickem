-- Admins receive revealed picks only. Aggregate pick counts keep the Players view useful.
create or replace function public.get_admin_data(p_pool_key text) returns jsonb
language plpgsql security definer set search_path=public, auth as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'registrationOpen', coalesce((select registration_open from app_settings where key='registration'), true),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'username',username,'contactEmail',contact_email) order by display_name) from profiles where not is_admin),'[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by kickoff,id) from games g where g.pool_key=p_pool_key),'[]'::jsonb),
    'pickCountsByUser', coalesce((select jsonb_object_agg(id, (select count(*) from picks pk where pk.user_id=profiles.id and pk.pool_key=p_pool_key and pk.team is not null)) from profiles where not is_admin), '{}'::jsonb),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('userId',pk.user_id,'gameId',pk.game_id,'team',pk.team,'confidence',pk.confidence)) from picks pk join games g on g.id=pk.game_id and g.pool_key=pk.pool_key where pk.pool_key=p_pool_key and (g.locked_at is not null or g.kickoff<=now())),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_admin_data(text) from public, anon;
grant execute on function public.get_admin_data(text) to authenticated;


-- Old audit entries may contain whole weeks, including unrevealed picks. Only
-- the filtered security-definer RPC may expose this table to authenticated users.
drop policy if exists admin_audit_read on public.admin_audit;

-- Let admins review the immutable pick-override audit trail in the UI.
create or replace function public.get_admin_override_history() returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', aa.id,
        'createdAt', aa.created_at,
        'adminName', coalesce(editor.display_name, editor.username, 'Admin'),
        'playerId', aa.target->>'userId',
        'playerName', coalesce(target.display_name, target.username, aa.target->>'userId'),
        'poolKey', aa.target->>'poolKey',
        'picks', coalesce((select jsonb_agg(item.pick order by item.position)
          from jsonb_array_elements(coalesce(aa.target->'picks', '[]'::jsonb)) with ordinality as item(pick, position)
          join games g on g.id=item.pick->>'gameId' and g.pool_key=aa.target->>'poolKey'
          where g.locked_at is not null or g.kickoff<=now()), '[]'::jsonb)
      ) order by aa.created_at desc, aa.id desc)
      from admin_audit aa
      left join profiles editor on editor.id = aa.admin_id
      left join profiles target on target.id = (aa.target->>'userId')::uuid
      where aa.action = 'admin_replace_picks'
        and exists (select 1 from profiles viewer where viewer.id = auth.uid() and viewer.is_admin)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_override_history() from public, anon;
grant execute on function public.get_admin_override_history() to authenticated;

-- Treat overrides as a patch, never as replacement of the entire draft.
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

  -- Share the draft lock with normal player saves, preventing concurrent rank collisions.
  insert into drafts(user_id,pool_key) values(p_user_id,p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id=p_user_id and pool_key=p_pool_key for update;
  if exists(
    select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,confidence integer)
    join picks pk on pk.user_id=p_user_id and pk.pool_key=p_pool_key and pk.confidence=x.confidence
    where not exists(select 1 from jsonb_to_recordset(p_picks) as changed("gameId" text) where changed."gameId"=pk.game_id)
  ) then raise exception 'CONFIDENCE_UNAVAILABLE'; end if;

  -- Delete only patched rows first, allowing atomic swaps without unique-index conflicts.
  delete from picks where user_id=p_user_id and pool_key=p_pool_key
    and game_id in (select "gameId" from jsonb_to_recordset(p_picks) as x("gameId" text));
  insert into picks(user_id,pool_key,game_id,team,confidence)
    select p_user_id,p_pool_key,x."gameId",x.team,x.confidence
    from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer);
  update drafts set revision=revision+1, updated_at=now() where user_id=p_user_id and pool_key=p_pool_key returning revision into current_revision;
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
