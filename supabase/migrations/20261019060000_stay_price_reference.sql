-- Typical whole-stay price per MS-DRG, next to the per-code typical prices
-- (#194). Some hospital files list a daily or partial rate under a stay DRG (a
-- $1,920 hip replacement stay, next to a typical ~$37,000). The app treats a
-- stay price more than 4x under the typical one as missing
-- (lib/cpt/price-bands.ts). Wrong data is worse than none.
--
-- Stay keys are 'drg:<code>' without leading zeros, so they never collide with
-- CPT or HCPCS codes. Only rows read straight from hospital files (source
-- 'cms_mrf') set the stay reference: imported rows often carry revenue codes
-- in the DRG column (a "460" priced at $270).
create or replace function public.refresh_code_price_reference()
returns integer
language plpgsql
security definer
set search_path = public, extensions
-- Kept from 20261019040000: create or replace resets function settings.
set statement_timeout = '10min'
as $$
declare
  affected integer;
  stays integer;
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

  insert into code_price_reference (code, professional, typical_price, sample_size)
  select
    'drg:' || regexp_replace(trim(c.ms_drg), '^0+(?=[0-9])', ''),
    false,
    percentile_cont(0.5) within group (
      order by coalesce(c.cash_price, c.avg_negotiated_rate)
    ),
    count(*)::integer
  from charges c
  where c.source = 'cms_mrf'
    and c.ms_drg is not null
    and c.cpt is null
    and c.hcpcs is null
    and coalesce(lower(c.billing_class), '') <> 'professional'
    and coalesce(c.cash_price, c.avg_negotiated_rate) >= 1
  group by 1
  having count(*) >= 20;

  get diagnostics stays = row_count;
  return affected + stays;
end;
$$;

revoke execute on function public.refresh_code_price_reference()
  from public, anon, authenticated;
grant execute on function public.refresh_code_price_reference() to service_role;

-- Fill the stay keys now rather than at the nightly refresh (04:00 UTC).
set statement_timeout = '30min';
select public.refresh_code_price_reference();
