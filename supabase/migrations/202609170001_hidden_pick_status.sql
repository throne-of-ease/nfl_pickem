-- Reveal only whether an unrevealed pick is complete. Team and confidence stay
-- server-side until kickoff, so the selected side cannot be inferred.
create or replace function public.get_season_data(p_pool_key text) returns jsonb
language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'pool', to_jsonb(p),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff, id) from games g where g.pool_key = p.key), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id = pk.game_id where pk.pool_key = p.key and (g.locked_at is not null or g.kickoff <= now())), '[]'::jsonb),
    'hiddenPickStatuses', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'gameId', pk.game_id)) from picks pk join games g on g.id = pk.game_id where pk.pool_key = p.key and pk.team is not null and pk.confidence is not null and g.locked_at is null and g.kickoff > now()), '[]'::jsonb),
    'viewer', coalesce((select jsonb_build_object('id', id, 'name', display_name, 'username', username, 'isAdmin', is_admin) from profiles where id = auth.uid()), '{}'::jsonb),
    'registrationOpen', coalesce((select registration_open from app_settings where key = 'registration'), true),
    'freshness', case when p.updated_at < now() - interval '10 minutes' then 'stale' else 'fresh' end,
    'asOf', p.updated_at,
    'dataRevision', p.data_revision
  ) from pools p where p.key = p_pool_key;
$$;

revoke all on function public.get_season_data(text) from public, anon;
grant execute on function public.get_season_data(text) to authenticated, service_role;
