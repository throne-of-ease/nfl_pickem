-- Let an authenticated admin reset an existing player's password without
-- exposing the service role key to the browser. The temporary password is
-- written as a hash and is never returned from this function.
create or replace function public.admin_reset_password(p_user_id uuid, p_temporary_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists(select 1 from profiles where id = p_user_id and not is_admin) then
    raise exception 'UNKNOWN_PLAYER';
  end if;
  if p_temporary_password is null
    or length(p_temporary_password) < 8
    or p_temporary_password !~ '[A-Z]'
    or p_temporary_password !~ '[a-z]'
    or p_temporary_password !~ '[0-9]'
  then
    raise exception 'INVALID_PASSWORD';
  end if;

  update auth.users
  set encrypted_password = crypt(p_temporary_password, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'UNKNOWN_PLAYER'; end if;

  insert into admin_audit(admin_id, action, target)
  values(auth.uid(), 'admin_reset_password', jsonb_build_object('userId', p_user_id));
  return jsonb_build_object('reset', true, 'userId', p_user_id);
end
$$;

revoke all on function public.admin_reset_password(uuid, text) from public, anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
