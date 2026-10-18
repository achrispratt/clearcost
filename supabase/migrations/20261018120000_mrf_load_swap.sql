-- Loading prices read straight from hospital price files (#25).
--
-- scripts/crawl-mrf.ts --load writes one hospital's crawled rows to
-- charges_mrf_staging under a load id, then calls apply_mrf_load(), which in
-- one transaction:
--   1. moves that hospital's older rows (Trilliant Oria) for the same codes
--      into charges_archive, so search never sees two prices for one code;
--   2. replaces the hospital's previous crawled rows (source 'cms_mrf');
--   3. copies the staged rows into charges and clears the stage;
--   4. refreshes the hospital's cash ratios.
-- restore_mrf_load() undoes it for one hospital. Readers of charges need no
-- change: archived rows are simply not in charges any more.
--
-- Codes are compared by value: the importer and the crawler keep CPT and
-- HCPCS codes under whichever label the hospital used, so 'G0121' in hcpcs
-- and 'G0121' in cpt are the same code. MS-DRGs compare without leading zeros.

create table if not exists public.charges_mrf_staging (
  like public.charges including defaults,
  load_id uuid not null
);
create index if not exists idx_charges_mrf_staging_load
  on public.charges_mrf_staging (load_id, provider_id);

create table if not exists public.charges_archive (
  like public.charges including defaults,
  archived_at timestamptz not null default now(),
  archived_for_load uuid not null
);
create index if not exists idx_charges_archive_provider
  on public.charges_archive (provider_id);

-- Service role only: RLS on with no policies, and no table grants.
alter table public.charges_mrf_staging enable row level security;
alter table public.charges_archive enable row level security;
revoke all on public.charges_mrf_staging from public, anon, authenticated;
revoke all on public.charges_archive from public, anon, authenticated;

create or replace function public.apply_mrf_load(
  p_provider_id uuid,
  p_load_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  staged integer;
  archived integer;
  replaced integer;
begin
  select count(*) into staged
  from charges_mrf_staging
  where load_id = p_load_id and provider_id = p_provider_id;
  if staged = 0 then
    raise exception 'load % has no staged rows for provider %',
      p_load_id, p_provider_id;
  end if;

  drop table if exists mrf_keys;
  create temp table mrf_keys on commit drop as
  select distinct k
  from charges_mrf_staging s,
    lateral (values (upper(s.cpt)), (upper(s.hcpcs)),
      ('DRG:' || ltrim(s.ms_drg, '0'))) v(k)
  where s.load_id = p_load_id and s.provider_id = p_provider_id
    and k is not null;

  with moved as (
    delete from charges c
    where c.provider_id = p_provider_id
      and c.source is distinct from 'cms_mrf'
      and (upper(c.cpt) in (select k from mrf_keys)
        or upper(c.hcpcs) in (select k from mrf_keys)
        or 'DRG:' || ltrim(c.ms_drg, '0') in (select k from mrf_keys))
    returning c.*
  )
  insert into charges_archive
  select m.*, now(), p_load_id from moved m;
  get diagnostics archived = row_count;

  delete from charges
  where provider_id = p_provider_id and source = 'cms_mrf';
  get diagnostics replaced = row_count;

  insert into charges (
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, source,
    imported_at, source_charge_id, last_updated, created_at
  )
  select
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, 'cms_mrf',
    now(), null, last_updated, now()
  from charges_mrf_staging
  where load_id = p_load_id and provider_id = p_provider_id;

  delete from charges_mrf_staging
  where load_id = p_load_id and provider_id = p_provider_id;

  perform refresh_provider_cash_ratios(array[p_provider_id]);

  return jsonb_build_object(
    'inserted', staged, 'archived', archived, 'replaced', replaced
  );
end;
$$;

create or replace function public.restore_mrf_load(p_provider_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  removed integer;
  restored integer;
begin
  delete from charges
  where provider_id = p_provider_id and source = 'cms_mrf';
  get diagnostics removed = row_count;

  with back as (
    delete from charges_archive a
    where a.provider_id = p_provider_id
    returning a.*
  )
  insert into charges (
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, source,
    imported_at, source_charge_id, last_updated, created_at
  )
  select
    id, provider_id, description, setting, billing_class, cpt, hcpcs, ms_drg,
    revenue_code, ndc, icd, modifiers, laterality, body_site, gross_charge,
    cash_price, min_price, max_price, avg_negotiated_rate,
    min_negotiated_rate, max_negotiated_rate, payer_count, source,
    imported_at, source_charge_id, last_updated, created_at
  from back;
  get diagnostics restored = row_count;

  perform refresh_provider_cash_ratios(array[p_provider_id]);

  return jsonb_build_object('removed', removed, 'restored', restored);
end;
$$;

revoke execute on function public.apply_mrf_load(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.apply_mrf_load(uuid, uuid) to service_role;
revoke execute on function public.restore_mrf_load(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_mrf_load(uuid) to service_role;
