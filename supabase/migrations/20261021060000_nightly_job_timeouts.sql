-- Scheduled jobs run as postgres, which Supabase caps at a 2-minute statement
-- timeout, and a function's own `set statement_timeout` doesn't extend the
-- statement that called it
-- (https://supabase.com/docs/guides/database/postgres/timeouts).
--
-- code-price-reference-refresh-daily finishes (1m34s on 2026-10-21) but grows
-- with each load, so it raises its session timeout first.
--
-- coverage-snapshot-daily is paused instead. It failed at the cap on
-- 2026-10-20 and 2026-10-21, and the same full aggregate over charges, run by
-- hand on 2026-10-21, used up Micro compute's disk IO burst and left the
-- database unresponsive for about an hour. Letting it run longer would risk
-- that every night. It comes back once it is rebuilt to read a small slice of
-- charges per night.
-- cron.schedule upserts by job name, so re-running this is harmless.

select cron.schedule(
  'code-price-reference-refresh-daily',
  '0 4 * * *',
  $$set statement_timeout = '10min'; select public.refresh_code_price_reference()$$
);

select cron.unschedule(jobid) from cron.job where jobname = 'coverage-snapshot-daily';
