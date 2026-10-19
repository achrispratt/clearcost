-- apply_mrf_load hit the API's 8-second statement timeout on the first
-- Oregon hospital (#25; the transaction rolled back cleanly): swapping one
-- hospital's ~5-10k rows into charges updates 15 indexes, including a
-- full-text GIN. A function-level timeout exempts just these two functions,
-- kept under the API gateway's 60-second request cap
-- (https://supabase.com/docs/guides/database/postgres/timeouts).
alter function public.apply_mrf_load(uuid, uuid) set statement_timeout = '55s';
alter function public.restore_mrf_load(uuid) set statement_timeout = '55s';
