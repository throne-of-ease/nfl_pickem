alter table public.pools add column if not exists accepts_late_picks boolean not null default false;

update public.pools set accepts_late_picks = key in ('preseason-01', 'preseason-02');

-- Launch reset: no sample or rehearsal picks survive into real-world testing.
delete from public.picks;
delete from public.drafts;

create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict(id) do update set display_name=excluded.display_name;
  return new;
end $$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup after insert or update of raw_user_meta_data on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.replace_picks_service(p_user_id uuid,p_pool_key text,p_expected_revision bigint,p_picks jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_revision bigint; game_count integer; submitted_count integer; distinct_count integer; pool_closed boolean; late_picks boolean;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'FORBIDDEN'; end if;
  select closed, accepts_late_picks into pool_closed, late_picks from pools where key=p_pool_key;
  if not found then raise exception 'UNKNOWN_POOL'; end if;
  if pool_closed then raise exception 'POOL_CLOSED'; end if;
  insert into drafts(user_id,pool_key) values(p_user_id,p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id=p_user_id and pool_key=p_pool_key for update;
  if current_revision <> p_expected_revision then raise exception 'STALE_DRAFT'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) left join games g on g.id=x."gameId" and g.pool_key=p_pool_key where g.id is null) then raise exception 'UNKNOWN_GAME'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) join games g on g.id=x."gameId" where x.team is not null and x.team not in (g.away_team,g.home_team)) then raise exception 'INVALID_TEAM'; end if;
  if not late_picks and exists(select 1 from games g left join picks old on old.game_id=g.id and old.user_id=p_user_id and old.pool_key=p_pool_key left join jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) on x."gameId"=g.id where g.pool_key=p_pool_key and (g.locked_at is not null or g.kickoff<=now()) and (old.team is distinct from x.team or old.confidence is distinct from x.confidence)) then raise exception 'LOCKED_GAME_CHANGED'; end if;
  select count(*),count(distinct confidence) into submitted_count,distinct_count from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) where confidence is not null;
  select count(*) into game_count from games where pool_key=p_pool_key;
  if submitted_count<>distinct_count or exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) where confidence is not null and confidence not between 1 and game_count) then raise exception 'INVALID_CONFIDENCE_SET'; end if;
  delete from picks where user_id=p_user_id and pool_key=p_pool_key and game_id not in (select "gameId" from jsonb_to_recordset(p_picks) as x("gameId" text));
  insert into picks(user_id,pool_key,game_id,team,confidence) select p_user_id,p_pool_key,x."gameId",x.team,x.confidence from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) on conflict(user_id,pool_key,game_id) do update set team=excluded.team,confidence=excluded.confidence;
  update drafts set revision=revision+1,updated_at=now() where user_id=p_user_id and pool_key=p_pool_key returning revision into current_revision;
  return jsonb_build_object('draftRevision',current_revision,'picks',p_picks);
end $$;

revoke all on function public.replace_picks_service(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.replace_picks_service(uuid,text,bigint,jsonb) to service_role;

create or replace function public.get_season_data(p_pool_key text) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'pool',to_jsonb(p),
    'games',coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff,id) from games g where g.pool_key=p.key),'[]'::jsonb),
    'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name) from profiles where not is_admin),'[]'::jsonb),
    'revealedPicks',coalesce((select jsonb_agg(jsonb_build_object('userId',pk.user_id,'gameId',pk.game_id,'team',pk.team,'confidence',pk.confidence)) from picks pk join games g on g.id=pk.game_id where pk.pool_key=p.key and (g.locked_at is not null or g.kickoff<=now())),'[]'::jsonb),
    'freshness',case when p.updated_at < now()-interval '10 minutes' then 'stale' else 'fresh' end,
    'asOf',p.updated_at,
    'dataRevision',p.data_revision
  ) from pools p where p.key=p_pool_key;
$$;

revoke all on function public.get_season_data(text) from public,anon,authenticated;
grant execute on function public.get_season_data(text) to service_role;
