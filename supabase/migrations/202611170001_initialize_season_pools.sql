-- Pools must exist independently of picks or schedule synchronization. Otherwise
-- get_season_data returns null (including the roster) and saves raise UNKNOWN_POOL.
insert into public.pools(key,label,phase,espn_season,espn_season_type,espn_week,counts_toward_season,accepts_late_picks)
select 'week-' || lpad(week::text,2,'0'), 'Week ' || week, 'regular', 2026, 2, week, true, false
from generate_series(1,18) week
union all values
  ('wild-card','Wild Card','postseason',2026,3,1,true,false),
  ('divisional','Divisional','postseason',2026,3,2,true,false),
  ('conference','Conference','postseason',2026,3,3,true,false),
  ('super-bowl','Super Bowl','postseason',2026,3,5,true,false)
on conflict(key) do nothing;
