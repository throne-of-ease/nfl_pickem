-- Keep the real-world profile trigger compatible with the username columns and
-- return a safe display name for the signed-in account.
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

create or replace function public.get_season_data(p_pool_key text) returns jsonb
language sql security definer set search_path=public, auth as $$
  select jsonb_build_object(
    'pool', to_jsonb(p),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by kickoff, id) from games g where g.pool_key=p.key), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles where not is_admin), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id=pk.game_id where pk.pool_key=p.key and (g.locked_at is not null or g.kickoff<=now())), '[]'::jsonb),
    'viewer', coalesce((select jsonb_build_object('id', id, 'name', display_name, 'username', username, 'isAdmin', is_admin) from profiles where id=auth.uid()), '{}'::jsonb),
    'registrationOpen', coalesce((select registration_open from app_settings where key='registration'), true),
    'freshness', case when p.updated_at < now()-interval '10 minutes' then 'stale' else 'fresh' end,
    'asOf', p.updated_at,
    'dataRevision', p.data_revision
  ) from pools p where p.key=p_pool_key;
$$;

revoke all on function public.get_season_data(text) from public, anon;
grant execute on function public.get_season_data(text) to authenticated, service_role;
