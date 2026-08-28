-- Browser clients may read the security-definer season data function. It only
-- returns picks that are already locked/revealed, so no private draft data is
-- exposed by this grant.
grant execute on function public.get_season_data(text) to authenticated;

-- Replace the service-only write path with an authenticated, per-user RPC.
create or replace function public.replace_picks(p_pool_key text, p_expected_revision bigint, p_picks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  current_revision bigint;
  game_count integer;
  submitted_count integer;
  distinct_count integer;
  pool_closed boolean;
  late_picks boolean;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  select closed, accepts_late_picks into pool_closed, late_picks from pools where key = p_pool_key;
  if not found then raise exception 'UNKNOWN_POOL'; end if;
  if pool_closed then raise exception 'POOL_CLOSED'; end if;

  insert into drafts(user_id, pool_key) values(v_user_id, p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id = v_user_id and pool_key = p_pool_key for update;
  if current_revision <> p_expected_revision then raise exception 'STALE_DRAFT'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    left join games g on g.id = x."gameId" and g.pool_key = p_pool_key
    where g.id is null
  ) then raise exception 'UNKNOWN_GAME'; end if;

  if exists(
    select 1
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    join games g on g.id = x."gameId" and g.pool_key = p_pool_key
    where x.team is not null and x.team not in (g.away_team, g.home_team)
  ) then raise exception 'INVALID_TEAM'; end if;

  if not late_picks and exists(
    select 1
    from games g
    left join picks old on old.game_id = g.id and old.user_id = v_user_id and old.pool_key = p_pool_key
    left join jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer) on x."gameId" = g.id
    where g.pool_key = p_pool_key
      and (g.locked_at is not null or g.kickoff <= now())
      and (old.team is distinct from x.team or old.confidence is distinct from x.confidence)
  ) then raise exception 'LOCKED_GAME_CHANGED'; end if;

  select count(*), count(distinct confidence)
    into submitted_count, distinct_count
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
   where confidence is not null;
  select count(*) into game_count from games where pool_key = p_pool_key;
  if submitted_count <> distinct_count or exists(
    select 1
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    where confidence is not null and confidence not between 1 and game_count
  ) then raise exception 'INVALID_CONFIDENCE_SET'; end if;

  delete from picks
   where user_id = v_user_id and pool_key = p_pool_key
     and game_id not in (select "gameId" from jsonb_to_recordset(p_picks) as x("gameId" text));
  insert into picks(user_id, pool_key, game_id, team, confidence)
    select v_user_id, p_pool_key, x."gameId", x.team, x.confidence
      from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    on conflict(user_id, pool_key, game_id) do update set team = excluded.team, confidence = excluded.confidence;
  update drafts set revision = revision + 1, updated_at = now()
   where user_id = v_user_id and pool_key = p_pool_key
   returning revision into current_revision;
  return jsonb_build_object('draftRevision', current_revision, 'picks', p_picks);
end $$;

revoke all on function public.replace_picks(text, bigint, jsonb) from public, anon;
grant execute on function public.replace_picks(text, bigint, jsonb) to authenticated;

-- Keep the pool metadata and its game slate in one database transaction.
create or replace function public.sync_pool_service(p_pool jsonb, p_games jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  game_count integer;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then raise exception 'FORBIDDEN'; end if;
  insert into pools(key, label, phase, espn_season, espn_season_type, espn_week, counts_toward_season, accepts_late_picks, updated_at)
    values (
      p_pool->>'key', p_pool->>'label', p_pool->>'phase', (p_pool->>'espnSeason')::integer,
      (p_pool->>'espnSeasonType')::integer, (p_pool->>'espnWeek')::integer,
      (p_pool->>'countsTowardSeason')::boolean, coalesce((p_pool->>'acceptsLatePicks')::boolean, false),
      (p_pool->>'updatedAt')::timestamptz
    )
  on conflict(key) do update set
    label = excluded.label,
    phase = excluded.phase,
    espn_season = excluded.espn_season,
    espn_season_type = excluded.espn_season_type,
    espn_week = excluded.espn_week,
    counts_toward_season = excluded.counts_toward_season,
    accepts_late_picks = excluded.accepts_late_picks,
    updated_at = excluded.updated_at,
    data_revision = pools.data_revision + 1;

  insert into games(id, pool_key, kickoff, away_team, home_team, status, away_score, home_score, period, display_clock, status_detail, matchup_quality, gotw, locked_at, predictor_home, home_moneyline, away_moneyline, pregame_snapshot)
    select x.id, x.pool_key, x.kickoff, x.away_team, x.home_team, x.status, x.away_score, x.home_score, x.period, x.display_clock, x.status_detail, x.matchup_quality, x.gotw, x.locked_at, x.predictor_home, x.home_moneyline, x.away_moneyline, x.pregame_snapshot
      from jsonb_to_recordset(p_games) as x(
        id text, pool_key text, kickoff timestamptz, away_team text, home_team text, status text,
        away_score integer, home_score integer, period integer, display_clock text, status_detail text, matchup_quality double precision, gotw boolean, locked_at timestamptz,
        predictor_home double precision, home_moneyline integer, away_moneyline integer, pregame_snapshot jsonb
      )
  on conflict(id) do update set
    pool_key = excluded.pool_key,
    kickoff = excluded.kickoff,
    away_team = excluded.away_team,
    home_team = excluded.home_team,
    status = excluded.status,
    away_score = excluded.away_score,
    home_score = excluded.home_score,
    period = excluded.period,
    display_clock = excluded.display_clock,
    status_detail = excluded.status_detail,
    matchup_quality = excluded.matchup_quality,
    gotw = games.gotw or excluded.gotw,
    locked_at = coalesce(games.locked_at, excluded.locked_at),
    predictor_home = excluded.predictor_home,
    home_moneyline = excluded.home_moneyline,
    away_moneyline = excluded.away_moneyline,
    pregame_snapshot = coalesce(games.pregame_snapshot, excluded.pregame_snapshot);
  get diagnostics game_count = row_count;
  return jsonb_build_object('pool', p_pool->>'key', 'games', game_count, 'asOf', p_pool->>'updatedAt');
end $$;

revoke all on function public.sync_pool_service(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_pool_service(jsonb, jsonb) to service_role;

-- The cron job invokes the Edge Function with secrets stored in Supabase Vault.
-- Create project_url, publishable_key and cron_secret Vault entries before use.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare job_id bigint;
begin
  for job_id in select jobid from cron.job where jobname = 'sync-nfl-season-every-five-minutes' loop
    perform cron.unschedule(job_id);
  end loop;
end $$;

select cron.schedule(
  'sync-nfl-season-every-five-minutes',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-season',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{"source":"cron"}'::jsonb
    ) as request_id;
  $$
);
