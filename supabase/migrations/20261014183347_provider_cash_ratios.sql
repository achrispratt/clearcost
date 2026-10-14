-- Per-hospital cash ratios, used to convert an insured or gross price into a
-- cash-equivalent when a hospital publishes no cash price for an episode line.
--   ratio_type 'insured' = cash_price / avg_negotiated_rate
--   ratio_type 'gross'   = cash_price / gross_charge
-- computed over each hospital's charges that publish both prices.
-- Computing this live takes ~50s for 50 hospitals, so it is materialized and
-- refreshed after each import: select refresh_provider_cash_ratios();
create table if not exists public.provider_cash_ratios (
  provider_id uuid not null references public.providers(id) on delete cascade,
  ratio_type text not null check (ratio_type in ('insured', 'gross')),
  pair_count integer not null,
  q1 double precision not null,
  median double precision not null,
  q3 double precision not null,
  computed_at timestamptz not null default now(),
  primary key (provider_id, ratio_type)
);

alter table public.provider_cash_ratios enable row level security;
create policy "Anyone can view provider cash ratios"
  on public.provider_cash_ratios for select using (true);
revoke insert, update, delete, truncate, references, trigger
  on public.provider_cash_ratios from anon, authenticated;

-- Recompute ratios for the given hospitals, or all hospitals when null.
create or replace function public.refresh_provider_cash_ratios(
  p_provider_ids uuid[] default null
)
returns integer
language plpgsql
set search_path = public, extensions
as $$
declare
  affected integer;
begin
  delete from provider_cash_ratios
  where p_provider_ids is null or provider_id = any(p_provider_ids);

  insert into provider_cash_ratios (provider_id, ratio_type, pair_count, q1, median, q3)
  select
    provider_id,
    ratio_type,
    count(*)::integer,
    percentile_cont(0.25) within group (order by r),
    percentile_cont(0.5) within group (order by r),
    percentile_cont(0.75) within group (order by r)
  from (
    select c.provider_id, 'insured'::text as ratio_type,
      (c.cash_price / c.avg_negotiated_rate)::double precision as r
    from charges c
    where c.cash_price > 0 and c.avg_negotiated_rate > 0
      and (p_provider_ids is null or c.provider_id = any(p_provider_ids))
    union all
    select c.provider_id, 'gross'::text,
      (c.cash_price / c.gross_charge)::double precision
    from charges c
    where c.cash_price > 0 and c.gross_charge > 0
      and (p_provider_ids is null or c.provider_id = any(p_provider_ids))
  ) pairs
  group by provider_id, ratio_type;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.refresh_provider_cash_ratios(uuid[])
  from public, anon, authenticated;
grant execute on function public.refresh_provider_cash_ratios(uuid[]) to service_role;
