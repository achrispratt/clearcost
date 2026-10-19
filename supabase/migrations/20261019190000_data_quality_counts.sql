-- Nightly counts of the price rows the app hides or flags, so the data-quality
-- register can be re-checked over time instead of going stale. Hospital files
-- change and price-transparency rules tighten; a count that moves tells us a
-- filter is catching more (or less) than when we wrote it.
--
-- Each metric mirrors a rule the results page applies at read time. Keep the
-- thresholds in step with:
--   placeholder_cash, cash_20x_under_insured  lib/cpt/price-sanity.ts (#184)
--   cash/insured/gross_out_of_band            lib/cpt/price-bands.ts BAND_FACTOR (#196)
--   stay_out_of_band                          lib/cpt/price-bands.ts STAY_LOW_FACTOR (#208)
--   drg_not_inpatient                         search RPC inpatient-only DRG match (#182)
-- The counts are per row in charges, before results are grouped per hospital.

create table if not exists public.data_quality_counts (
  taken_on date not null,
  source text not null,
  metric text not null,
  value bigint not null,
  primary key (taken_on, source, metric)
);

-- Service role only: RLS on with no policies, and no table grants.
alter table public.data_quality_counts enable row level security;
revoke all on public.data_quality_counts from public, anon, authenticated;

create or replace function public.snapshot_data_quality()
returns integer
language plpgsql
security definer
set search_path = public, extensions
set statement_timeout = '20min'
as $$
declare
  written integer;
begin
  delete from data_quality_counts where taken_on = current_date;

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
  insert into data_quality_counts (taken_on, source, metric, value)
  select current_date, c.source, m.metric, m.value
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

-- After the 04:00 UTC typical-price refresh, so the band counts use tonight's
-- reference. cron.schedule upserts by job name.
select cron.schedule(
  'data-quality-snapshot-daily',
  '30 4 * * *',
  $$select public.snapshot_data_quality()$$
);

-- First snapshot now rather than at the nightly run.
set statement_timeout = '30min';
select public.snapshot_data_quality();
