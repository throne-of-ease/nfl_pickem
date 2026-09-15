-- Aggressiveness needs the frozen pregame model inputs for historical games.
-- Keep the rest of the snapshot private and continue returning only locked picks.
create or replace function public.get_chart_data() returns jsonb
language sql security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(
      (to_jsonb(g) - 'pregame_snapshot') || jsonb_build_object(
        'predictor_home', coalesce((g.pregame_snapshot->>'predictorHome')::double precision, g.predictor_home),
        'home_moneyline', coalesce((g.pregame_snapshot->>'homeMoneyline')::integer, g.home_moneyline),
        'away_moneyline', coalesce((g.pregame_snapshot->>'awayMoneyline')::integer, g.away_moneyline)
      ) order by g.kickoff, g.id
    ) from games g), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'poolKey', pk.pool_key, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id = pk.game_id where g.locked_at is not null or g.kickoff <= now()), '[]'::jsonb)
  );
$$;

revoke all on function public.get_chart_data() from public, anon;
grant execute on function public.get_chart_data() to authenticated;
