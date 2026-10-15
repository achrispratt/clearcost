-- National typical price per billing code (#194). Some hospital files carry
-- prices that can't be real for the code (a $4.41 knee MRI, a $6,089 blood
-- count). The app treats a price more than 10x below or above the typical
-- price for its code as missing (lib/cpt/price-bands.ts). Wrong data is worse
-- than none.
--
-- Doctor-only (professional) lines are a fraction of the hospital price, so
-- they get their own typical price. MS-DRG stays are not covered here.
--
-- Computing this scans every charge (~50s), so it is materialized and
-- refreshed with the existing post-import step:
--   select refresh_provider_cash_ratios();
create table if not exists public.code_price_reference (
  code text not null,
  professional boolean not null,
  typical_price numeric(12, 2) not null,
  sample_size integer not null,
  refreshed_at timestamptz not null default now(),
  primary key (code, professional)
);

alter table public.code_price_reference enable row level security;
drop policy if exists "Anyone can view code price reference" on public.code_price_reference;
create policy "Anyone can view code price reference"
  on public.code_price_reference for select using (true);
revoke insert, update, delete, truncate, references, trigger
  on public.code_price_reference from anon, authenticated;

create or replace function public.refresh_code_price_reference()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  affected integer;
begin
  delete from code_price_reference where true;

  insert into code_price_reference (code, professional, typical_price, sample_size)
  select
    upper(trim(coalesce(c.cpt, c.hcpcs))),
    coalesce(lower(c.billing_class) = 'professional', false),
    percentile_cont(0.5) within group (
      order by coalesce(c.cash_price, c.avg_negotiated_rate)
    ),
    count(*)::integer
  from charges c
  where coalesce(c.cpt, c.hcpcs) is not null
    and coalesce(c.cash_price, c.avg_negotiated_rate) >= 1
  group by 1, 2
  -- With fewer rows the median isn't a reliable reference.
  having count(*) >= 20;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.refresh_code_price_reference()
  from public, anon, authenticated;
grant execute on function public.refresh_code_price_reference() to service_role;

-- The post-import step refreshes the reference too, so there is still one
-- command to run after an import. Body unchanged apart from the last call.
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

  if p_provider_ids is null then
    perform refresh_code_price_reference();
  end if;

  return affected;
end;
$$;

revoke execute on function public.refresh_provider_cash_ratios(uuid[])
  from public, anon, authenticated;
grant execute on function public.refresh_provider_cash_ratios(uuid[]) to service_role;

-- The first fill scans every charge; give it room.
set statement_timeout = '30min';
select public.refresh_code_price_reference();
