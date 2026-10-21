-- The nightly full-scan jobs ran into Supabase's global 2-minute statement
-- timeout for the postgres role: data-quality-snapshot-daily and
-- coverage-snapshot-daily failed on 2026-10-20 and 2026-10-21, and
-- code-price-reference-refresh-daily is at 1m34s and growing with each load.
-- A function's own `set statement_timeout` doesn't extend the statement that
-- called it, so each job now raises the timeout for its own session first
-- (https://supabase.com/docs/guides/database/postgres/timeouts).
-- cron.schedule upserts by job name, so re-running this is harmless.

select cron.schedule(
  'code-price-reference-refresh-daily',
  '0 4 * * *',
  $$set statement_timeout = '10min'; select public.refresh_code_price_reference()$$
);

select cron.schedule(
  'data-quality-snapshot-daily',
  '30 4 * * *',
  $$set statement_timeout = '20min'; select public.snapshot_data_quality()$$
);

select cron.schedule(
  'coverage-snapshot-daily',
  '45 4 * * *',
  $$set statement_timeout = '20min'; select public.snapshot_coverage()$$
);
