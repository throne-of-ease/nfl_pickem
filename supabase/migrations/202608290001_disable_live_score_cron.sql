-- Live scores and win probabilities are now read directly from ESPN by the client.
-- Keep sync-season available for explicit schedule/admin operations, but do not
-- write live score snapshots to Supabase every five minutes.
do $$
declare job_id bigint;
begin
  for job_id in select jobid from cron.job where jobname = 'sync-nfl-season-every-five-minutes' loop
    perform cron.unschedule(job_id);
  end loop;
end $$;
