-- Preseason is a rehearsal pool: every preseason slate stays editable so a
-- player can enter or correct picks after the real game has started.
update public.pools
   set accepts_late_picks = true
 where phase = 'preseason';

-- Validate the whole replacement before touching rows. Deleting and inserting
-- inside this transaction also makes confidence swaps safe with the unique
-- (user, pool, confidence) index.
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

create or replace function public.admin_replace_picks(p_user_id uuid, p_pool_key text, p_picks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_revision bigint;
  game_count integer;
  submitted_games integer;
  distinct_games integer;
  submitted_count integer;
  distinct_count integer;
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from profiles where id = p_user_id and not is_admin) then raise exception 'UNKNOWN_PLAYER'; end if;
  if not exists(select 1 from pools where key = p_pool_key) then raise exception 'UNKNOWN_POOL'; end if;
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
  select count(*), count(distinct confidence)
    into submitted_count, distinct_count
    from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
   where confidence is not null;
  select count(*) into game_count from games where pool_key = p_pool_key;
  if submitted_count <> distinct_count or exists(
    select 1 from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer)
    where confidence is not null and confidence not between 1 and game_count
  ) then raise exception 'INVALID_CONFIDENCE_SET'; end if;

  insert into drafts(user_id, pool_key) values(p_user_id, p_pool_key) on conflict do nothing;
  delete from picks where user_id = p_user_id and pool_key = p_pool_key;
  insert into picks(user_id, pool_key, game_id, team, confidence)
    select p_user_id, p_pool_key, x."gameId", x.team, x.confidence
      from jsonb_to_recordset(p_picks) as x("gameId" text, team text, confidence integer);
  update drafts set revision = revision + 1, updated_at = now()
   where user_id = p_user_id and pool_key = p_pool_key
   returning revision into current_revision;
  insert into admin_audit(admin_id, action, target)
  values(auth.uid(), 'admin_replace_picks', jsonb_build_object('userId', p_user_id, 'poolKey', p_pool_key, 'picks', p_picks));
  return jsonb_build_object('draftRevision', current_revision, 'picks', p_picks);
end $$;

revoke all on function public.admin_replace_picks(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_replace_picks(uuid, text, jsonb) to authenticated;

-- Include the admin as a normal visible player. The admin flag and private
-- drafts remain protected; only revealed picks are returned.
create or replace function public.get_season_data(p_pool_key text) returns jsonb
language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'pool', to_jsonb(p),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff, id) from games g where g.pool_key = p.key), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id = pk.game_id where pk.pool_key = p.key and (g.locked_at is not null or g.kickoff <= now())), '[]'::jsonb),
    'viewer', coalesce((select jsonb_build_object('id', id, 'name', display_name, 'username', username, 'isAdmin', is_admin) from profiles where id = auth.uid()), '{}'::jsonb),
    'registrationOpen', coalesce((select registration_open from app_settings where key = 'registration'), true),
    'freshness', case when p.updated_at < now() - interval '10 minutes' then 'stale' else 'fresh' end,
    'asOf', p.updated_at,
    'dataRevision', p.data_revision
  ) from pools p where p.key = p_pool_key;
$$;

revoke all on function public.get_season_data(text) from public, anon;
grant execute on function public.get_season_data(text) to authenticated, service_role;

create or replace function public.get_chart_data() returns jsonb
language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by g.kickoff, g.id) from games g), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'poolKey', pk.pool_key, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id = pk.game_id where g.locked_at is not null or g.kickoff <= now()), '[]'::jsonb)
  );
$$;

revoke all on function public.get_chart_data() from public, anon;
grant execute on function public.get_chart_data() to authenticated;
