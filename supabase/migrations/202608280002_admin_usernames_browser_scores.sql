-- Browser ESPN data is the live read path. Keep server fields available as a
-- fallback and give admins the small set of writes the UI needs.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists contact_email text;
alter table public.games add column if not exists period integer;
alter table public.games add column if not exists display_clock text;
alter table public.games add column if not exists status_detail text;
alter table public.games add column if not exists matchup_quality double precision;

update public.profiles p
set username = lower(split_part(u.email, '@', 1)),
    contact_email = case when u.email not like '%@accounts.nfl-pickem.invalid' then u.email else null end
from auth.users u
where u.id = p.id and p.username is null;

update public.profiles
set username = 'player-' || left(id::text, 8)
where username is null or trim(username) = '';

alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_unique on public.profiles(lower(username));

create table if not exists public.app_settings (
  key text primary key,
  registration_open boolean not null default true
);
insert into public.app_settings(key, registration_open)
values ('registration', true)
on conflict (key) do nothing;
alter table public.app_settings enable row level security;

create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  requested_username text := lower(trim(new.raw_user_meta_data->>'username'));
  fallback_username text := lower(split_part(new.email, '@', 1));
begin
  insert into public.profiles(id, display_name, username, contact_email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), fallback_username),
    coalesce(nullif(requested_username, ''), fallback_username),
    nullif(trim(new.raw_user_meta_data->>'contact_email'), '')
  )
  on conflict(id) do update set
    display_name = excluded.display_name,
    username = coalesce(public.profiles.username, excluded.username),
    contact_email = coalesce(excluded.contact_email, public.profiles.contact_email);
  return new;
end $$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup after insert or update of raw_user_meta_data on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.get_registration_status() returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object('registrationOpen', coalesce((select registration_open from app_settings where key='registration'), true));
$$;
grant execute on function public.get_registration_status() to anon, authenticated;

create or replace function public.set_registration_open(p_open boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  insert into app_settings(key, registration_open) values('registration', p_open)
  on conflict(key) do update set registration_open=excluded.registration_open;
  insert into admin_audit(admin_id, action, target) values(auth.uid(), 'set_registration_open', jsonb_build_object('open', p_open));
  return jsonb_build_object('registrationOpen', p_open);
end $$;
revoke all on function public.set_registration_open(boolean) from public, anon;
grant execute on function public.set_registration_open(boolean) to authenticated;

create or replace function public.get_season_data(p_pool_key text) returns jsonb
language sql security definer set search_path=public, auth as $$
  select jsonb_build_object(
    'pool', to_jsonb(p),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff,id) from games g where g.pool_key=p.key),'[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'username',username) order by display_name) from profiles where not is_admin),'[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId',pk.user_id,'gameId',pk.game_id,'team',pk.team,'confidence',pk.confidence)) from picks pk join games g on g.id=pk.game_id where pk.pool_key=p.key and (g.locked_at is not null or g.kickoff<=now())),'[]'::jsonb),
    'viewer', coalesce((select jsonb_build_object('id',id,'name',display_name,'username',username,'isAdmin',is_admin) from profiles where id=auth.uid()), '{}'::jsonb),
    'registrationOpen', coalesce((select registration_open from app_settings where key='registration'), true),
    'freshness', case when p.updated_at < now()-interval '10 minutes' then 'stale' else 'fresh' end,
    'asOf', p.updated_at,
    'dataRevision', p.data_revision
  ) from pools p where p.key=p_pool_key;
$$;
revoke all on function public.get_season_data(text) from public, anon;
grant execute on function public.get_season_data(text) to authenticated;

create or replace function public.get_admin_data(p_pool_key text) returns jsonb
language plpgsql security definer set search_path=public, auth as $$
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'registrationOpen', coalesce((select registration_open from app_settings where key='registration'), true),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',display_name,'username',username,'contactEmail',contact_email) order by display_name) from profiles where not is_admin),'[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by kickoff,id) from games g where g.pool_key=p_pool_key),'[]'::jsonb),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('userId',user_id,'gameId',game_id,'team',team,'confidence',confidence)) from picks where pool_key=p_pool_key),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_admin_data(text) from public, anon;
grant execute on function public.get_admin_data(text) to authenticated;

create or replace function public.admin_replace_picks(p_user_id uuid, p_pool_key text, p_picks jsonb) returns jsonb
language plpgsql security definer set search_path=public, auth as $$
declare
  current_revision bigint;
  game_count integer;
  submitted_count integer;
  distinct_count integer;
begin
  if not exists(select 1 from profiles where id=auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from profiles where id=p_user_id and not is_admin) then raise exception 'UNKNOWN_PLAYER'; end if;
  if not exists(select 1 from pools where key=p_pool_key) then raise exception 'UNKNOWN_POOL'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) left join games g on g.id=x."gameId" and g.pool_key=p_pool_key where g.id is null) then raise exception 'UNKNOWN_GAME'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) join games g on g.id=x."gameId" and g.pool_key=p_pool_key where x.team is not null and x.team not in (g.away_team,g.home_team)) then raise exception 'INVALID_TEAM'; end if;
  select count(*), count(distinct confidence) into submitted_count, distinct_count from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) where confidence is not null;
  select count(*) into game_count from games where pool_key=p_pool_key;
  if submitted_count<>distinct_count or exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) where confidence is not null and confidence not between 1 and game_count) then raise exception 'INVALID_CONFIDENCE_SET'; end if;
  insert into drafts(user_id,pool_key) values(p_user_id,p_pool_key) on conflict do nothing;
  delete from picks where user_id=p_user_id and pool_key=p_pool_key and game_id not in (select "gameId" from jsonb_to_recordset(p_picks) as x("gameId" text));
  insert into picks(user_id,pool_key,game_id,team,confidence)
    select p_user_id,p_pool_key,x."gameId",x.team,x.confidence from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer)
    on conflict(user_id,pool_key,game_id) do update set team=excluded.team, confidence=excluded.confidence;
  update drafts set revision=revision+1, updated_at=now() where user_id=p_user_id and pool_key=p_pool_key returning revision into current_revision;
  insert into admin_audit(admin_id, action, target) values(auth.uid(), 'admin_replace_picks', jsonb_build_object('userId',p_user_id,'poolKey',p_pool_key,'picks',p_picks));
  return jsonb_build_object('draftRevision',current_revision,'picks',p_picks);
end $$;
revoke all on function public.admin_replace_picks(uuid,text,jsonb) from public, anon;
grant execute on function public.admin_replace_picks(uuid,text,jsonb) to authenticated;

-- The app now refreshes ESPN in the browser; stop the old five-minute database
-- poll. Keep the edge function available for an explicit operator diagnostic.
do $$
declare job_id bigint;
begin
  for job_id in select jobid from cron.job where jobname = 'sync-nfl-season-every-five-minutes' loop
    perform cron.unschedule(job_id);
  end loop;
exception when undefined_table then
  null;
end $$;
