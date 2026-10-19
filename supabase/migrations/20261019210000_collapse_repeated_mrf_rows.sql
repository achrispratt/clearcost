-- Hospital price files repeat the same code at the same prices many times
-- (once per revenue code, drug package or chargemaster wording), and the
-- crawler loaded every copy: 2.02M cms_mrf rows, of which only ~915k carry
-- a distinct price. The loader now keeps one row per distinct price
-- (storableRows in lib/crawler/load.ts); this removes the copies already
-- loaded, plus rows with no price at all, using the same key. The space
-- is reused by later state loads, keeping the database inside the plan's
-- included disk.

set statement_timeout = '30min';

delete from public.charges c
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by provider_id, cpt, hcpcs, ms_drg, setting, billing_class,
          modifiers, laterality, body_site, gross_charge, cash_price,
          min_price, max_price, avg_negotiated_rate, min_negotiated_rate,
          max_negotiated_rate
        order by created_at, id
      ) as rn,
      gross_charge is null and cash_price is null and min_price is null
        and max_price is null and avg_negotiated_rate is null
        and min_negotiated_rate is null and max_negotiated_rate is null
        as no_price
    from public.charges
    where source = 'cms_mrf'
  ) ranked
  where rn > 1 or no_price
) doomed
where c.id = doomed.id;
