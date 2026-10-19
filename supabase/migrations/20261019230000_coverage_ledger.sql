-- A nightly ledger of what the database can price, so nothing goes missing
-- unnoticed. Loads from hospital price files, dedupes and migrations all
-- rewrite charges; a hospital that quietly loses its prices, or a code that
-- disappears everywhere, looks like "no results" to a patient rather than an
-- error. Each night records, per hospital, how many codes it prices and, per
-- code, how many hospitals price it; coverage_drops() lists what fell between
-- two nights. scripts/data-check.ts reads both (docs/data-checks.md).
--
-- coverage_fingerprint() gives the same per-code view for a handful of
-- hospitals right now, so a load can be checked before and after without
-- waiting for the nightly run.
--
-- A code key is the CPT or HCPCS code, upper-cased, or 'DRG:<n>' for an
-- MS-DRG without leading zeros (the same keys apply_mrf_load() uses).
-- "Priced" means any of cash, insured average or list price is above zero:
-- this ledger tracks rows that exist, while data_quality_counts tracks which
-- of them the read-time filters hide.

create table if not exists public.provider_coverage (
  taken_on date not null,
  provider_id uuid not null,
  rows bigint not null,
  codes integer not null,
  priced_codes integer not null,
  cash_codes integer not null,
  insured_codes integer not null,
  primary key (taken_on, provider_id)
);

create table if not exists public.code_coverage (
  taken_on date not null,
  code text not null,
  providers integer not null,
  priced_providers integer not null,
  cash_providers integer not null,
  primary key (taken_on, code)
);

-- Service role only: RLS on with no policies, and no table grants.
alter table public.provider_coverage enable row level security;
alter table public.code_coverage enable row level security;
revoke all on public.provider_coverage from public, anon, authenticated;
revoke all on public.code_coverage from public, anon, authenticated;

create or replace function public.charge_code_key(
  p_cpt text,
  p_hcpcs text,
  p_ms_drg text
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(upper(trim(p_cpt)), ''),
    nullif(upper(trim(p_hcpcs)), ''),
    'DRG:' || nullif(ltrim(trim(p_ms_drg), '0'), '')
  )
$$;

create or replace function public.snapshot_coverage()
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '20min'
-- ~5M hospital-code pairs: more memory for the grouping means less of it
-- spills to temporary files on disk (one job, at 04:45 UTC).
set work_mem = '64MB'
as $$
declare
  written integer;
begin
  drop table if exists coverage_pairs;
  create temp table coverage_pairs on commit drop as
  select
    provider_id,
    code,
    count(*) as rows,
    bool_or(cash_price > 0 or avg_negotiated_rate > 0 or gross_charge > 0) as priced,
    bool_or(cash_price > 0) as cash,
    bool_or(avg_negotiated_rate > 0) as insured
  from (
    select
      provider_id,
      charge_code_key(cpt, hcpcs, ms_drg) as code,
      cash_price,
      avg_negotiated_rate,
      gross_charge
    from charges
  ) c
  where code is not null
  group by provider_id, code;

  delete from provider_coverage where taken_on = current_date;
  insert into provider_coverage (
    taken_on, provider_id, rows, codes, priced_codes, cash_codes, insured_codes
  )
  select
    current_date,
    provider_id,
    sum(rows),
    count(*),
    count(*) filter (where priced),
    count(*) filter (where cash),
    count(*) filter (where insured)
  from coverage_pairs
  group by provider_id;

  delete from code_coverage where taken_on = current_date;
  insert into code_coverage (
    taken_on, code, providers, priced_providers, cash_providers
  )
  select
    current_date,
    code,
    count(*),
    count(*) filter (where priced),
    count(*) filter (where cash)
  from coverage_pairs
  group by code;

  -- Keep five weeks of nights, plus the first of each month for the long view.
  delete from provider_coverage
  where taken_on < current_date - 35 and extract(day from taken_on) <> 1;
  delete from code_coverage
  where taken_on < current_date - 35 and extract(day from taken_on) <> 1;

  select count(*) into written from provider_coverage where taken_on = current_date;
  return written;
end;
$$;

-- What fell between two snapshots (default: the latest two). A hospital is
-- listed when it disappeared or priced at least 5 fewer codes and at least
-- 10% fewer; a code when at least 3 fewer hospitals and at least 10% fewer
-- price it. 'total' rows give the overall before and after either way.
create or replace function public.coverage_drops(
  p_before date default null,
  p_after date default null
)
returns table (
  kind text,
  key text,
  before_value bigint,
  after_value bigint
)
language plpgsql
stable
set search_path = public
as $$
declare
  d_after date := coalesce(p_after, (select max(taken_on) from provider_coverage));
  d_before date := coalesce(
    p_before,
    (select max(taken_on) from provider_coverage where taken_on < d_after)
  );
begin
  if d_before is null or d_after is null then
    return;
  end if;

  return query
  select 'total'::text, 'providers_priced'::text,
    (select count(*) from provider_coverage
      where taken_on = d_before and priced_codes > 0),
    (select count(*) from provider_coverage
      where taken_on = d_after and priced_codes > 0)
  union all
  select 'total', 'provider_codes_priced',
    (select coalesce(sum(priced_codes), 0) from provider_coverage where taken_on = d_before)::bigint,
    (select coalesce(sum(priced_codes), 0) from provider_coverage where taken_on = d_after)::bigint
  union all
  select 'total', 'codes_priced',
    (select count(*) from code_coverage
      where taken_on = d_before and priced_providers > 0),
    (select count(*) from code_coverage
      where taken_on = d_after and priced_providers > 0);

  return query
  select 'provider'::text, b.provider_id::text,
    b.priced_codes::bigint, coalesce(a.priced_codes, 0)::bigint
  from provider_coverage b
  left join provider_coverage a
    on a.provider_id = b.provider_id and a.taken_on = d_after
  where b.taken_on = d_before
    and b.priced_codes > 0
    and (a.provider_id is null
      or (b.priced_codes - a.priced_codes >= 5
        and a.priced_codes < b.priced_codes * 0.9))
  order by b.priced_codes - coalesce(a.priced_codes, 0) desc;

  return query
  select 'code'::text, b.code,
    b.priced_providers::bigint, coalesce(a.priced_providers, 0)::bigint
  from code_coverage b
  left join code_coverage a
    on a.code = b.code and a.taken_on = d_after
  where b.taken_on = d_before
    and b.priced_providers > 0
    and (a.code is null
      or (b.priced_providers - a.priced_providers >= 3
        and a.priced_providers < b.priced_providers * 0.9))
  order by b.priced_providers - coalesce(a.priced_providers, 0) desc;
end;
$$;

-- Per hospital and code, right now: row counts and price ranges, plus when
-- the hospital's price file was last loaded. A load check takes this before
-- and after (scripts/data-check.ts snapshot) to show exactly what changed.
create or replace function public.coverage_fingerprint(p_provider_ids uuid[])
returns table (
  provider_id uuid,
  code text,
  rows bigint,
  priced_rows bigint,
  cash_min numeric,
  cash_max numeric,
  insured_min numeric,
  insured_max numeric,
  sources text[],
  last_loaded timestamptz
)
language sql
stable
set search_path = public
set statement_timeout = '50s'
as $$
  select
    c.provider_id,
    charge_code_key(c.cpt, c.hcpcs, c.ms_drg) as code,
    count(*),
    count(*) filter (
      where c.cash_price > 0 or c.avg_negotiated_rate > 0 or c.gross_charge > 0
    ),
    min(c.cash_price) filter (where c.cash_price > 0),
    max(c.cash_price) filter (where c.cash_price > 0),
    min(c.avg_negotiated_rate) filter (where c.avg_negotiated_rate > 0),
    max(c.avg_negotiated_rate) filter (where c.avg_negotiated_rate > 0),
    array_agg(distinct coalesce(c.source, 'unknown') order by coalesce(c.source, 'unknown')),
    max(c.imported_at) filter (where c.source = 'cms_mrf')
  from charges c
  where c.provider_id = any(p_provider_ids)
    and charge_code_key(c.cpt, c.hcpcs, c.ms_drg) is not null
  group by 1, 2
$$;

revoke execute on function public.snapshot_coverage() from public, anon, authenticated;
grant execute on function public.snapshot_coverage() to service_role;
revoke execute on function public.coverage_drops(date, date) from public, anon, authenticated;
grant execute on function public.coverage_drops(date, date) to service_role;
revoke execute on function public.coverage_fingerprint(uuid[]) from public, anon, authenticated;
grant execute on function public.coverage_fingerprint(uuid[]) to service_role;

-- After the 04:30 UTC data-quality counts. cron.schedule upserts by job name.
select cron.schedule(
  'coverage-snapshot-daily',
  '45 4 * * *',
  $$select public.snapshot_coverage()$$
);

-- No first snapshot here: the full scan outlasts the deploy's statement
-- timeout. The first nightly run records the baseline; the second has
-- something to compare to.
