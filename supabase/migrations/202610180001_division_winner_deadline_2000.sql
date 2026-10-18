-- Move the configured Division winners deadline to 20:00 Europe/Berlin
-- while preserving the currently configured calendar date.
update public.app_settings
set division_lock_at = (
  ((division_lock_at at time zone 'Europe/Berlin')::date + time '20:00')
  at time zone 'Europe/Berlin'
)
where key = 'division_winners'
  and division_lock_at is not null;
