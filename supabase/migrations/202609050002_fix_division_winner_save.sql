-- PostgreSQL has jsonb_object_keys(), not jsonb_object_length().
-- Recreate the RPC so the first authenticated save executes successfully.
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
