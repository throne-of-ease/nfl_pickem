-- Admin accounts can participate in Division winners too. After the deadline,
-- reveal every submitted draft, including admins, while keeping all other
-- players' picks private before the lock.
create or replace function public.get_division_winner_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings record;
  v_locked boolean;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;

  select division_lock_week, division_lock_at, division_points_per_correct
    into v_settings
    from app_settings
   where key = 'division_winners';
  if not found then raise exception 'DIVISION_SETTINGS_MISSING'; end if;

  v_locked := v_settings.division_lock_at <= now();

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'lockWeek', v_settings.division_lock_week,
      'lockAt', v_settings.division_lock_at,
      'pointsPerCorrect', v_settings.division_points_per_correct
    ),
    'locked', v_locked,
    'viewerDraft', jsonb_build_object(
      'revision', coalesce((select revision from division_winner_drafts where user_id = auth.uid()), 0),
      'picks', coalesce((select picks from division_winner_drafts where user_id = auth.uid()), '{}'::jsonb)
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name)
        from profiles
       where not is_admin
    ), '[]'::jsonb),
    'drafts', case when v_locked then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', d.user_id,
          'name', p.display_name,
          'revision', d.revision,
          'picks', d.picks
        )
        order by p.display_name
      )
        from division_winner_drafts d
        join profiles p on p.id = d.user_id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

revoke all on function public.get_division_winner_data() from public, anon;
grant execute on function public.get_division_winner_data() to authenticated;
