-- The per-code typical prices behind the 10x impossible-price filter (#196)
-- scan every charge (~50s), too long for an API call (8s statement limit,
-- 60s gateway cap). Loads from hospital price files (scripts/crawl-mrf.ts
-- --load) change charges daily, so refresh the reference nightly in the
-- database instead of from the script.
alter function public.refresh_code_price_reference() set statement_timeout = '10min';

select cron.schedule(
  'code-price-reference-refresh-daily',
  '0 4 * * *',
  $$select public.refresh_code_price_reference()$$
);
