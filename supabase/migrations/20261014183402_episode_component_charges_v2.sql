-- Episode estimator: like lookup_episode_component_charges(), but also returns
-- billing_class and the negotiated-rate range so estimates can keep facility
-- and professional fees apart and convert insured prices to cash equivalents.
-- Added as a new function because changing the original's return type needs a
-- DROP; the old function can be dropped once nothing calls it.

create or replace function public.lookup_episode_component_charges_v2(
  p_principal_code text,
  p_provider_ids uuid[],
  p_min_association float default 0.4
)
returns table (
  provider_id uuid,
  component_code text,
  component_code_type text,
  component_tier text,
  component_association float,
  billing_class text,
  cash_price numeric,
  gross_charge numeric,
  avg_negotiated_rate numeric,
  min_negotiated_rate numeric,
  max_negotiated_rate numeric,
  min_price numeric,
  max_price numeric
)
language sql
stable
set search_path = public, extensions
as $$
  with episode as (
    select id from episode_definitions
    where principal_code = p_principal_code
    limit 1
  ),
  components as (
    select ec.code, ec.code_type, ec.tier, ec.association
    from episode_components ec
    join episode e on e.id = ec.episode_id
    where ec.association >= p_min_association
      and ec.code_type in ('cpt', 'hcpcs')
  )
  select
    c.provider_id,
    comp.code as component_code,
    comp.code_type as component_code_type,
    comp.tier as component_tier,
    comp.association as component_association,
    c.billing_class,
    c.cash_price,
    c.gross_charge,
    c.avg_negotiated_rate,
    c.min_negotiated_rate,
    c.max_negotiated_rate,
    c.min_price,
    c.max_price
  from components comp
  join charges c on (
    (comp.code_type = 'cpt' and (c.cpt = comp.code or c.hcpcs = comp.code))
    or (comp.code_type = 'hcpcs' and c.hcpcs = comp.code)
  )
  where c.provider_id = any(p_provider_ids);
$$;
