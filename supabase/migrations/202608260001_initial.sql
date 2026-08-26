create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_admin boolean not null default false
);

create table public.pools (
  key text primary key,
  label text not null,
  phase text not null check (phase in ('preseason','regular','postseason')),
  espn_season integer not null,
  espn_season_type integer not null check (espn_season_type between 1 and 3),
  espn_week integer not null,
  counts_toward_season boolean not null,
  closed boolean not null default false,
  data_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.games (
  id text primary key,
  pool_key text not null references public.pools(key) on delete cascade,
  kickoff timestamptz not null,
  away_team text not null,
  home_team text not null,
  status text not null check (status in ('scheduled','live','final')),
  away_score integer,
  home_score integer,
  gotw boolean not null default false,
  locked_at timestamptz,
  predictor_home double precision,
  home_moneyline integer,
  away_moneyline integer,
  pregame_snapshot jsonb,
  unique(pool_key,id)
);

create table public.drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pool_key text not null references public.pools(key) on delete cascade,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,pool_key)
);

create table public.picks (
  user_id uuid not null,
  pool_key text not null,
  game_id text not null references public.games(id) on delete cascade,
  team text,
  confidence integer check(confidence > 0),
  primary key(user_id,pool_key,game_id),
  foreign key(user_id,pool_key) references public.drafts(user_id,pool_key) on delete cascade
);

create unique index picks_unique_confidence on public.picks(user_id,pool_key,confidence) where confidence is not null;

create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.pools enable row level security;
alter table public.games enable row level security;
alter table public.drafts enable row level security;
alter table public.picks enable row level security;
alter table public.admin_audit enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(true);
create policy pools_read on public.pools for select using(phase <> 'preseason' or current_setting('app.preseason_rehearsal_enabled', true) = 'true');
create policy games_read on public.games for select using(exists(select 1 from public.pools where pools.key=games.pool_key));
create policy own_drafts on public.drafts for select to authenticated using(user_id=auth.uid());
create policy visible_picks on public.picks for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.games g where g.id=game_id and (g.locked_at is not null or g.kickoff <= now())));
create policy admin_audit_read on public.admin_audit for select to authenticated using(exists(select 1 from public.profiles where id=auth.uid() and is_admin));

create or replace function public.get_my_draft(p_pool_key text) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'draftRevision',coalesce((select revision from drafts where user_id=auth.uid() and pool_key=p_pool_key),0),
    'picks',(select jsonb_agg(jsonb_build_object('gameId',g.id,'team',p.team,'confidence',p.confidence) order by g.kickoff,g.id) from games g left join picks p on p.game_id=g.id and p.user_id=auth.uid() where g.pool_key=p_pool_key)
  );
$$;
grant execute on function public.get_my_draft(text) to authenticated;

create or replace function public.replace_picks_service(p_user_id uuid,p_pool_key text,p_expected_revision bigint,p_picks jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_revision bigint; game_count integer; submitted_count integer; distinct_count integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'FORBIDDEN'; end if;
  if (select closed from pools where key=p_pool_key) then raise exception 'POOL_CLOSED'; end if;
  insert into drafts(user_id,pool_key) values(p_user_id,p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id=p_user_id and pool_key=p_pool_key for update;
  if current_revision <> p_expected_revision then raise exception 'STALE_DRAFT'; end if;
  if exists(select 1 from jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) left join games g on g.id=x."gameId" and g.pool_key=p_pool_key where g.id is null) then raise exception 'UNKNOWN_GAME'; end if;
  if exists(select 1 from picks old join games g on g.id=old.game_id left join jsonb_to_recordset(p_picks) as x("gameId" text,team text,confidence integer) on x."gameId"=old.game_id where old.user_id=p_user_id and old.pool_key=p_pool_key and (g.locked_at is not null or g.kickoff<=now()) and (x."gameId" is null or old.team is distinct from x.team or old.confidence is distinct from x.confidence)) then raise exception 'LOCKED_GAME_CHANGED'; end if;
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
  select jsonb_build_object('pool',to_jsonb(p),'games',coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff,id) from games g where g.pool_key=p.key),'[]'::jsonb),'revealedPicks','[]'::jsonb,'officialStandings','[]'::jsonb,'provisionalStandings','[]'::jsonb,'analytics','{}'::jsonb,'freshness',case when p.updated_at < now()-interval '10 minutes' then 'stale' else 'fresh' end,'asOf',p.updated_at,'dataRevision',p.data_revision) from pools p where p.key=p_pool_key;
$$;
revoke all on function public.get_season_data(text) from public,anon,authenticated;
grant execute on function public.get_season_data(text) to service_role;
