-- Division winner drafts are deliberately separate from weekly picks and totals.
alter table public.app_settings add column if not exists division_lock_week integer;
alter table public.app_settings add column if not exists division_lock_at timestamptz;
alter table public.app_settings add column if not exists division_points_per_correct integer;
alter table public.app_settings drop constraint if exists app_settings_division_lock_week_check;
alter table public.app_settings add constraint app_settings_division_lock_week_check check (division_lock_week is null or division_lock_week between 1 and 18);
alter table public.app_settings drop constraint if exists app_settings_division_points_check;
alter table public.app_settings add constraint app_settings_division_points_check check (division_points_per_correct is null or division_points_per_correct between 0 and 100);

insert into public.app_settings(key, registration_open, division_lock_week, division_lock_at, division_points_per_correct)
values ('division_winners', true, 5, '2026-10-11T17:00:00Z', 5)
on conflict (key) do update set
  division_lock_week = coalesce(public.app_settings.division_lock_week, excluded.division_lock_week),
  division_lock_at = coalesce(public.app_settings.division_lock_at, excluded.division_lock_at),
  division_points_per_correct = coalesce(public.app_settings.division_points_per_correct, excluded.division_points_per_correct);

create table if not exists public.division_winner_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision bigint not null default 0,
  picks jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(picks) = 'object')
);

alter table public.division_winner_drafts enable row level security;
revoke all on table public.division_winner_drafts from anon, authenticated;

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
    'settings', jsonb_build_object('lockWeek', v_settings.division_lock_week, 'lockAt', v_settings.division_lock_at, 'pointsPerCorrect', v_settings.division_points_per_correct),
    'locked', v_locked,
    'viewerDraft', jsonb_build_object(
      'revision', coalesce((select revision from division_winner_drafts where user_id = auth.uid()), 0),
      'picks', coalesce((select picks from division_winner_drafts where user_id = auth.uid()), '{}'::jsonb)
    ),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name) order by display_name) from profiles where not is_admin), '[]'::jsonb),
    'drafts', case when v_locked then coalesce((select jsonb_agg(jsonb_build_object('userId', d.user_id, 'name', p.display_name, 'revision', d.revision, 'picks', d.picks) order by p.display_name) from division_winner_drafts d join profiles p on p.id = d.user_id where not p.is_admin), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;

revoke all on function public.get_division_winner_data() from public, anon;
grant execute on function public.get_division_winner_data() to authenticated;

create or replace function public.replace_division_winner_picks(p_expected_revision bigint, p_picks jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current_revision bigint;
  v_lock_at timestamptz;
  v_key text;
  v_raw_team text;
  v_team text;
  v_seen text[] := '{}';
  v_allowed jsonb := '{
    "afc-east": ["BUF", "MIA", "NE", "NYJ"],
    "afc-north": ["BAL", "CIN", "CLE", "PIT"],
    "afc-south": ["HOU", "IND", "JAX", "TEN"],
    "afc-west": ["DEN", "KC", "LV", "LAC"],
    "nfc-east": ["DAL", "NYG", "PHI", "WAS"],
    "nfc-north": ["CHI", "DET", "GB", "MIN"],
    "nfc-south": ["ATL", "CAR", "NO", "TB"],
    "nfc-west": ["ARI", "LAR", "SF", "SEA"]
  }'::jsonb;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select division_lock_at into v_lock_at from app_settings where key = 'division_winners';
  if not found then raise exception 'DIVISION_SETTINGS_MISSING'; end if;
  if v_lock_at <= now() then raise exception 'DIVISION_WINNERS_LOCKED'; end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'object' then raise exception 'MALFORMED_DIVISION_PICKS'; end if;
  if (select count(*) from jsonb_object_keys(p_picks)) > 8 then raise exception 'MALFORMED_DIVISION_PICKS'; end if;

  insert into division_winner_drafts(user_id) values(auth.uid()) on conflict do nothing;
  select revision into v_current_revision from division_winner_drafts where user_id = auth.uid() for update;
  if v_current_revision <> p_expected_revision then raise exception 'STALE_DIVISION_DRAFT'; end if;

  for v_key, v_raw_team in select key, value #>> '{}' from jsonb_each(p_picks) loop
    if not (v_allowed ? v_key) then raise exception 'UNKNOWN_DIVISION'; end if;
    if v_raw_team is null or jsonb_typeof(p_picks -> v_key) <> 'string' then raise exception 'MALFORMED_DIVISION_PICKS'; end if;
    v_team := upper(v_raw_team);
    if v_team = 'WSH' then v_team := 'WAS'; end if;
    if not (v_allowed -> v_key ? v_team) then raise exception 'INVALID_DIVISION_TEAM'; end if;
    if v_team = any(v_seen) then raise exception 'DUPLICATE_DIVISION_TEAM'; end if;
    v_seen := array_append(v_seen, v_team);
  end loop;

  update division_winner_drafts
     set picks = p_picks,
         revision = revision + 1,
         updated_at = now()
   where user_id = auth.uid()
   returning revision into v_current_revision;
  return jsonb_build_object('draftRevision', v_current_revision, 'picks', p_picks);
end $$;

revoke all on function public.replace_division_winner_picks(bigint, jsonb) from public, anon;
grant execute on function public.replace_division_winner_picks(bigint, jsonb) to authenticated;

create or replace function public.set_division_winner_settings(p_lock_week integer, p_lock_at timestamptz, p_points_per_correct integer)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_previous jsonb;
begin
  if not exists(select 1 from profiles where id = auth.uid() and is_admin) then raise exception 'FORBIDDEN'; end if;
  if p_lock_week is null or p_lock_week not between 1 and 18 then raise exception 'INVALID_LOCK_WEEK'; end if;
  if p_lock_at is null then raise exception 'INVALID_LOCK_AT'; end if;
  if p_points_per_correct is null or p_points_per_correct not between 0 and 100 then raise exception 'INVALID_DIVISION_POINTS'; end if;
  select jsonb_build_object('lockWeek', division_lock_week, 'lockAt', division_lock_at, 'pointsPerCorrect', division_points_per_correct) into v_previous from app_settings where key = 'division_winners' for update;
  if v_previous is null then raise exception 'DIVISION_SETTINGS_MISSING'; end if;
  update app_settings set division_lock_week = p_lock_week, division_lock_at = p_lock_at, division_points_per_correct = p_points_per_correct where key = 'division_winners';
  insert into admin_audit(admin_id, action, target) values(auth.uid(), 'set_division_winner_settings', jsonb_build_object('previous', v_previous, 'next', jsonb_build_object('lockWeek', p_lock_week, 'lockAt', p_lock_at, 'pointsPerCorrect', p_points_per_correct)));
  return jsonb_build_object('lockWeek', p_lock_week, 'lockAt', p_lock_at, 'pointsPerCorrect', p_points_per_correct);
end $$;

revoke all on function public.set_division_winner_settings(integer, timestamptz, integer) from public, anon;
grant execute on function public.set_division_winner_settings(integer, timestamptz, integer) to authenticated;
