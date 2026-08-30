-- Allow a signed-in player to change the display name used by the app.
create or replace function public.update_my_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  value text := trim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if value = '' or length(value) > 40 then raise exception 'INVALID_DISPLAY_NAME'; end if;
  update profiles set display_name = value where id = auth.uid();
  if not found then raise exception 'UNKNOWN_PROFILE'; end if;
  return jsonb_build_object('displayName', value);
end;
$$;

revoke all on function public.update_my_display_name(text) from public, anon;
grant execute on function public.update_my_display_name(text) to authenticated;

-- Remove an override record from the admin history without exposing the audit
-- table as a general-purpose delete endpoint.
create or replace function public.delete_admin_override(p_override_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  delete from admin_audit where id = p_override_id and action = 'admin_replace_picks';
  if not found then raise exception 'UNKNOWN_OVERRIDE'; end if;
  return jsonb_build_object('deleted', p_override_id);
end;
$$;

revoke all on function public.delete_admin_override(bigint) from public, anon;
grant execute on function public.delete_admin_override(bigint) to authenticated;
