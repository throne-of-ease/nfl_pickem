-- Let admins review the immutable pick-override audit trail in the UI.
create or replace function public.get_admin_override_history() returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', aa.id,
        'createdAt', aa.created_at,
        'adminName', coalesce(editor.display_name, editor.username, 'Admin'),
        'playerId', aa.target->>'userId',
        'playerName', coalesce(target.display_name, target.username, aa.target->>'userId'),
        'poolKey', aa.target->>'poolKey',
        'picks', coalesce(aa.target->'picks', '[]'::jsonb)
      ) order by aa.created_at desc, aa.id desc)
      from admin_audit aa
      left join profiles editor on editor.id = aa.admin_id
      left join profiles target on target.id = (aa.target->>'userId')::uuid
      where aa.action = 'admin_replace_picks'
        and exists (select 1 from profiles viewer where viewer.id = auth.uid() and viewer.is_admin)
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_override_history() from public, anon;
grant execute on function public.get_admin_override_history() to authenticated;
