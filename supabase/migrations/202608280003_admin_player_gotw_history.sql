create or replace function public.admin_delete_player(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare
  target jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object('id', id, 'name', display_name, 'username', username)
    into target
    from profiles
   where id = p_user_id and not is_admin;
  if target is null then raise exception 'UNKNOWN_PLAYER'; end if;

  insert into admin_audit(admin_id, action, target)
  values(auth.uid(), 'admin_delete_player', target);
  delete from auth.users where id = p_user_id;
  return target;
end $$;

revoke all on function public.admin_delete_player(uuid) from public, anon;
grant execute on function public.admin_delete_player(uuid) to authenticated;

create or replace function public.get_admin_gotw_data() returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.kickoff, g.id) from games g), '[]'::jsonb)
  );
end $$;

revoke all on function public.get_admin_gotw_data() from public, anon;
grant execute on function public.get_admin_gotw_data() to authenticated;

create or replace function public.set_game_of_week(p_pool_key text, p_game_id text) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from pools where key = p_pool_key) then raise exception 'UNKNOWN_POOL'; end if;
  if p_game_id is not null and not exists(select 1 from games where id = p_game_id and pool_key = p_pool_key) then raise exception 'UNKNOWN_GAME'; end if;

  update games
     set gotw = p_game_id is not null and id = p_game_id
   where pool_key = p_pool_key;
  insert into admin_audit(admin_id, action, target)
  values(auth.uid(), 'set_game_of_week', jsonb_build_object('poolKey', p_pool_key, 'gameId', p_game_id));
  return jsonb_build_object('poolKey', p_pool_key, 'gameId', p_game_id);
end $$;

revoke all on function public.set_game_of_week(text, text) from public, anon;
grant execute on function public.set_game_of_week(text, text) to authenticated;

create or replace function public.get_chart_data() returns jsonb
language sql security definer set search_path = public, auth
as $$
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles where not is_admin), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) - 'pregame_snapshot' order by g.kickoff, g.id) from games g), '[]'::jsonb),
    'revealedPicks', coalesce((select jsonb_agg(jsonb_build_object('userId', pk.user_id, 'poolKey', pk.pool_key, 'gameId', pk.game_id, 'team', pk.team, 'confidence', pk.confidence)) from picks pk join games g on g.id = pk.game_id where g.locked_at is not null or g.kickoff <= now()), '[]'::jsonb)
  );
$$;

revoke all on function public.get_chart_data() from public, anon;
grant execute on function public.get_chart_data() to authenticated;
