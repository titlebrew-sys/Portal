-- Runs the Loyverse sync every 5 minutes.
-- Before running: replace YOUR-PROJECT-URL and YOUR-ANON-KEY below (Supabase > Project Settings > API).
-- The anon key is the public key the website already uses; never paste the service_role key here.
-- Safe to run again: it replaces the old schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'loyverse-sync';

select cron.schedule(
  'loyverse-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'YOUR-PROJECT-URL/functions/v1/loyverse-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR-ANON-KEY'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
