-- Temporary Week 3 exception for the named test player; other accounts and weeks keep kickoff locks.
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
  submitted_games integer;
  distinct_games integer;
  submitted_count integer;
  distinct_count integer;
  pool_closed boolean;
  late_picks boolean;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  select closed, accepts_late_picks into pool_closed, late_picks from pools where key = p_pool_key;
  if not found then raise exception 'UNKNOWN_POOL'; end if;
  if pool_closed then raise exception 'POOL_CLOSED'; end if;
  late_picks := late_picks or (p_pool_key = 'week-03'
    and now() < timestamptz '2026-09-29 10:00:00+00'
    and exists(select 1 from profiles where id = v_user_id and lower(username) = 'nflstresstest2026'));

  insert into drafts(user_id, pool_key) values(v_user_id, p_pool_key) on conflict do nothing;
  select revision into current_revision from drafts where user_id = v_user_id and pool_key = p_pool_key for update;
  if current_revision <> p_expected_revision then raise exception 'STALE_DRAFT'; end if;

  select count(*), count(distinct "gameId")
    into submitted_games, distinct_games
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer);
  if submitted_games <> distinct_games then raise exception 'INVALID_CONFIDENCE_SET'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    left join games g on g.id = x."gameId" and g.pool_key = p_pool_key
    where g.id is null
  ) then raise exception 'UNKNOWN_GAME'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
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
    select 1 from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    where confidence is not null and confidence not between 1 and game_count
  ) then raise exception 'INVALID_CONFIDENCE_SET'; end if;

  delete from picks where user_id = v_user_id and pool_key = p_pool_key;
  insert into picks(user_id, pool_key, game_id, team, confidence)
    select v_user_id, p_pool_key, x."gameId", x.team, x.confidence
      from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer);
  update drafts set revision = revision + 1, updated_at = now()
   where user_id = v_user_id and pool_key = p_pool_key
   returning revision into current_revision;
  return jsonb_build_object('draftRevision', current_revision, 'picks', p_picks);
end $$;

revoke all on function public.replace_picks(text, bigint, jsonb) from public, anon;
grant execute on function public.replace_picks(text, bigint, jsonb) to authenticated;

