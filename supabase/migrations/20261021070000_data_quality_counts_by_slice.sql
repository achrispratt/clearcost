-- The nightly data-quality counts (#209) read all of charges in one statement.
-- That can't finish inside the 2-minute cap Supabase puts on scheduled jobs
-- (failed 2026-10-20 and 2026-10-21), and a full aggregate over charges run
-- longer by hand used up Micro compute's disk IO burst and left the database
-- unresponsive for about an hour on 2026-10-21. So each night now reads one
-- fourteenth of the table's pages (a TID range scan: ~240 MB, a few seconds),
-- keeps that slice's counts, and writes the day's totals as the sum of every
-- slice's latest counts. All 14 slices are fresh within two weeks.
--
-- Rows that move pages between nights (loads delete and insert) can be
-- missed or counted twice until their slices come round again, so the totals
-- are close, not exact. Fine for spotting a filter drifting.
--
-- Metrics and thresholds are unchanged from 20261019190000_data_quality_counts.sql;
-- keep them in step with lib/cpt/price-sanity.ts and lib/cpt/price-bands.ts.

create table if not exists public.data_quality_slice_counts (
  slice integer not null,
  taken_on date not null,
  source text not null,
  metric text not null,
  value bigint not null,
  primary key (slice, source, metric)
);

-- Service role only: RLS on with no policies, and no table grants.
alter table public.data_quality_slice_counts enable row level security;
revoke all on public.data_quality_slice_counts from public, anon, authenticated;

create or replace function public.snapshot_data_quality()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  slices constant integer := 14;
  this_slice integer := (current_date - date '2026-01-01') % slices;
  pages bigint := pg_relation_size('public.charges') / current_setting('block_size')::integer;
  first_page bigint;
  end_page bigint;
  written integer;
begin
  first_page := pages * this_slice / slices;
  -- The last slice runs to the end, so pages added since the size was read
  -- are still covered.
  end_page := case when this_slice = slices - 1 then 4294967295 else pages * (this_slice + 1) / slices end;

  delete from data_quality_slice_counts where slice = this_slice;

  with base as (
    select
      c.source,
      c.cash_price,
      c.gross_charge,
      c.avg_negotiated_rate,
      c.min_negotiated_rate,
      c.ms_drg,
      c.setting,
      upper(trim(coalesce(c.cpt, c.hcpcs))) as code,
      coalesce(lower(trim(c.billing_class)) = 'professional', false) as professional
    from charges c
    where c.ctid >= format('(%s,0)', first_page)::tid
      and c.ctid < format('(%s,0)', end_page)::tid
  ),
  tagged as (
    select
      r.*,
      r.code ~ '^[A-V][0-9]{4}$' as level_ii,
      r.code is null and r.ms_drg is not null as stay,
      ref.typical_price as typical,
      stay_ref.typical_price as stay_typical
    from base r
    left join code_price_reference ref
      on ref.code = r.code and ref.professional = r.professional
    left join code_price_reference stay_ref
      on r.code is null and r.ms_drg is not null and not r.professional
      and stay_ref.professional = false
      and stay_ref.code = 'drg:' || regexp_replace(trim(r.ms_drg), '^0+(?=[0-9])', '')
  ),
  counts as (
    select
      coalesce(source, 'unknown') as source,
      count(*) as total_rows,
      count(*) filter (where cash_price is not null) as has_cash,
      count(*) filter (where avg_negotiated_rate is not null) as has_insured,
      count(*) filter (
        where cash_price is null and avg_negotiated_rate is null and gross_charge is null
      ) as no_price,
      count(*) filter (
        where not coalesce(level_ii, false) and cash_price > 0 and cash_price < 1
      ) as placeholder_cash,
      count(*) filter (
        where not coalesce(level_ii, false) and cash_price >= 1
          and min_negotiated_rate > 0 and cash_price * 20 < min_negotiated_rate
      ) as cash_20x_under_insured,
      count(*) filter (
        where not stay and not coalesce(level_ii, false) and typical > 0
          and (cash_price < typical / 10 or cash_price > typical * 10)
      ) as cash_out_of_band,
      count(*) filter (
        where not stay and not coalesce(level_ii, false) and typical > 0
          and (avg_negotiated_rate < typical / 10 or avg_negotiated_rate > typical * 10)
      ) as insured_out_of_band,
      count(*) filter (
        where not stay and not coalesce(level_ii, false) and typical > 0
          and gross_charge < typical / 10
      ) as gross_too_low,
      count(*) filter (where stay) as stay_rows,
      count(*) filter (
        where stay and stay_typical > 0
          and (cash_price < stay_typical / 4 or cash_price > stay_typical * 10
            or avg_negotiated_rate < stay_typical / 4
            or avg_negotiated_rate > stay_typical * 10)
      ) as stay_out_of_band,
      count(*) filter (
        where stay and coalesce(lower(trim(setting)), '') <> 'inpatient'
      ) as drg_not_inpatient
    from tagged
    group by 1
  )
  insert into data_quality_slice_counts (slice, taken_on, source, metric, value)
  select this_slice, current_date, c.source, m.metric, m.value
  from counts c
  cross join lateral (values
    ('total_rows', c.total_rows),
    ('has_cash', c.has_cash),
    ('has_insured', c.has_insured),
    ('no_price', c.no_price),
    ('placeholder_cash', c.placeholder_cash),
    ('cash_20x_under_insured', c.cash_20x_under_insured),
    ('cash_out_of_band', c.cash_out_of_band),
    ('insured_out_of_band', c.insured_out_of_band),
    ('gross_too_low', c.gross_too_low),
    ('stay_rows', c.stay_rows),
    ('stay_out_of_band', c.stay_out_of_band),
    ('drg_not_inpatient', c.drg_not_inpatient)
  ) as m(metric, value);

  delete from data_quality_counts where taken_on = current_date;

  insert into data_quality_counts (taken_on, source, metric, value)
  select current_date, source, metric, sum(value)
  from data_quality_slice_counts
  group by source, metric;

  -- How complete the day's totals are: 14 slices once a full cycle has run,
  -- and how stale the oldest one is.
  insert into data_quality_counts (taken_on, source, metric, value)
  select current_date, 'all', 'slices_counted', count(distinct slice)
  from data_quality_slice_counts
  union all
  select current_date, 'all', 'oldest_slice_age_days',
    coalesce(current_date - min(taken_on), 0)
  from data_quality_slice_counts;

  -- Small tables, or an index-only read of the archive's provider index.
  insert into data_quality_counts (taken_on, source, metric, value)
  values
    (current_date, 'all', 'archived_rows', (select count(*) from charges_archive)),
    (current_date, 'all', 'archived_providers',
      (select count(distinct provider_id) from charges_archive)),
    (current_date, 'all', 'providers', (select count(*) from providers)),
    (current_date, 'all', 'providers_no_location',
      (select count(*) from providers where location is null)),
    (current_date, 'all', 'providers_with_website',
      (select count(*) from providers where website is not null)),
    (current_date, 'all', 'providers_with_mrf_index',
      (select count(*) from providers where mrf_index_url is not null));

  select count(*) into written from data_quality_counts where taken_on = current_date;
  return written;
end;
$$;

revoke execute on function public.snapshot_data_quality()
  from public, anon, authenticated;
grant execute on function public.snapshot_data_quality() to service_role;

-- Same slot as before, no raised timeout: one slice finishes well inside the
-- 2-minute cap. cron.schedule upserts by job name.
select cron.schedule(
  'data-quality-snapshot-daily',
  '30 4 * * *',
  $$select public.snapshot_data_quality()$$
);
