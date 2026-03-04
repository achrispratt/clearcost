-- ClearCost Database Schema
-- Run this in the Supabase SQL editor to set up your database.
-- Supports national coverage, all billing code types (CPT, HCPCS, MS-DRG, ICD, NDC, Revenue Code).

-- Enable PostGIS for geographic queries
create extension if not exists postgis;

-- ============================================================================
-- PROVIDERS (hospitals, imaging centers, labs, ASCs, clinics)
-- National scope: ~5,200+ facilities from Trilliant Oria + future MRF crawling
-- ============================================================================
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  provider_type text, -- 'hospital', 'imaging_center', 'ambulatory_surgery_center', 'lab', 'clinic'
  npi text unique,    -- National Provider Identifier
  trilliant_hospital_id bigint unique, -- FK to Trilliant Oria data (null if from other source)
  location geography(Point, 4326) generated always as (
    case when lat is not null and lng is not null
      then st_setsrid(st_makepoint(lng, lat), 4326)::geography
      else null
    end
  ) stored,
  last_updated date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_providers_location on providers using gist (location);
create index if not exists idx_providers_state on providers (state);
create index if not exists idx_providers_zip on providers (zip);
create index if not exists idx_providers_trilliant on providers (trilliant_hospital_id);

-- ============================================================================
-- CHARGES (all services, all billing code types)
-- Replaces the old `prices` table. One row per service per provider.
-- Contains base prices + aggregate negotiated rate stats (denormalized for search speed).
-- National scale: ~10-25M rows.
-- ============================================================================
create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  description text,
  setting text,        -- 'inpatient', 'outpatient', 'both'
  billing_class text,

  -- Billing codes: support ALL types. A charge may have codes in multiple systems.
  cpt text,            -- Current Procedural Terminology (most common for outpatient)
  hcpcs text,          -- Healthcare Common Procedure Coding System
  ms_drg text,         -- Medicare Severity Diagnosis Related Group (inpatient)
  revenue_code text,   -- Revenue code
  ndc text,            -- National Drug Code
  icd text,            -- ICD-10 diagnosis/procedure code
  modifiers text,      -- Modifier codes (comma-separated if multiple)
  laterality text,     -- 'left', 'right', 'bilateral', or null (parsed from description/modifiers)

  -- Base prices (from hospital's published standard charges)
  gross_charge numeric(12, 2),     -- Chargemaster / list price
  cash_price numeric(12, 2),       -- Discounted cash price (what self-pay patients pay)
  min_price numeric(12, 2),        -- Minimum negotiated rate across all payers
  max_price numeric(12, 2),        -- Maximum negotiated rate across all payers

  -- Aggregate negotiated rate stats (denormalized from payer_rates for search performance)
  avg_negotiated_rate numeric(12, 2),
  min_negotiated_rate numeric(12, 2),
  max_negotiated_rate numeric(12, 2),
  payer_count integer default 0,

  -- Metadata
  source text default 'trilliant_oria', -- Data source: 'trilliant_oria', 'cms_mrf', etc.
  last_updated timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_charges_cpt on charges (cpt);
create index if not exists idx_charges_hcpcs on charges (hcpcs);
create index if not exists idx_charges_ms_drg on charges (ms_drg);
create index if not exists idx_charges_provider on charges (provider_id);
create index if not exists idx_charges_cpt_provider on charges (cpt, provider_id);
create index if not exists idx_charges_hcpcs_provider on charges (hcpcs, provider_id);
create index if not exists idx_charges_provider_cpt on charges (provider_id, cpt);
create index if not exists idx_charges_provider_hcpcs on charges (provider_id, hcpcs);
create index if not exists idx_charges_provider_ms_drg on charges (provider_id, ms_drg);
create index if not exists idx_charges_description on charges using gin (to_tsvector('english', coalesce(description, '')));
create index if not exists idx_charges_laterality on charges (laterality) where laterality is not null;

-- ============================================================================
-- Laterality parser (SQL mirror of lib/cpt/parse-laterality.ts)
-- ============================================================================
create or replace function parse_laterality(
  p_description text,
  p_modifiers text
)
returns text
language sql
immutable
as $$
  select case
    when p_modifiers is not null and upper(p_modifiers) ~ '\m50\M'
      then 'bilateral'
    when p_modifiers is not null and upper(p_modifiers) ~ '\mLT\M'
      then 'left'
    when p_modifiers is not null and upper(p_modifiers) ~ '\mRT\M'
      then 'right'
    -- no \mBI\M here — too many false positives (BI-RADS, BI-V, etc.)
    when p_description is not null and upper(p_description) ~ '\mLT\M'
      then 'left'
    when p_description is not null and upper(p_description) ~ '\mRT\M'
      then 'right'
    when p_description is not null and (upper(p_description) ~ '\mBILATERAL\M' or upper(p_description) ~ '\mBILAT\M')
      then 'bilateral'
    when p_description is not null and upper(p_description) ~ '\mLEFT\M'
      then 'left'
    when p_description is not null and upper(p_description) ~ '\mRIGHT\M'
      then 'right'
    else null
  end;
$$;

-- ============================================================================
-- PAYER RATES (insurance-specific negotiated rates)
-- One row per payer per charge. Filtered to top national payers during import.
-- National scale: ~50-200M rows (top 10 payers).
-- ============================================================================
create table if not exists payer_rates (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id) on delete cascade,
  payer_name text not null,
  plan_name text,
  rate numeric(12, 2),
  methodology text,    -- 'case_rate', 'per_diem', 'fee_schedule', 'percent_of_charge', etc.
  created_at timestamptz default now()
);

create index if not exists idx_payer_rates_charge on payer_rates (charge_id);
create index if not exists idx_payer_rates_payer on payer_rates (payer_name);

-- ============================================================================
-- PAYERS (canonical payer list for UI dropdown / filtering)
-- ============================================================================
create table if not exists payers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,       -- Normalized canonical name (used in payer_rates.payer_name)
  display_name text not null,      -- User-friendly display name
  created_at timestamptz default now()
);

-- ============================================================================
-- SAVED SEARCHES (user bookmarks — now with coordinates)
-- ============================================================================
create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  query text not null,
  location text not null,
  cpt_codes text[] not null,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create index if not exists idx_saved_searches_user on saved_searches (user_id);

-- ============================================================================
-- TRANSLATION CACHE (query -> deterministic translation payload)
-- ============================================================================
create table if not exists translation_cache (
  query_hash text primary key,
  normalized_query text not null,
  payload jsonb not null,
  hit_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_translation_cache_updated_at on translation_cache (updated_at desc);

-- ============================================================================
-- RPC: search_charges_nearby()
-- Main search function. Finds charges near a geographic point by billing code.
-- Supports CPT, HCPCS, and MS-DRG code types.
-- Returns charges + provider info + aggregate rate stats + distance.
-- ============================================================================
create or replace function search_charges_nearby(
  p_code_type text,             -- 'cpt', 'hcpcs', or 'ms_drg'
  p_codes text[],               -- Array of billing codes to search for
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40,
  p_limit integer default 600,
  p_provider_limit integer default 300,
  p_laterality text default null -- 'left', 'right', 'bilateral', or null (no filter)
)
returns table (
  id uuid,
  provider_id uuid,
  provider_name text,
  provider_address text,
  provider_city text,
  provider_state text,
  provider_zip text,
  provider_lat double precision,
  provider_lng double precision,
  provider_phone text,
  provider_website text,
  provider_type text,
  description text,
  setting text,
  billing_class text,
  laterality text,
  cpt text,
  hcpcs text,
  ms_drg text,
  gross_charge numeric,
  cash_price numeric,
  min_price numeric,
  max_price numeric,
  avg_negotiated_rate numeric,
  min_negotiated_rate numeric,
  max_negotiated_rate numeric,
  payer_count integer,
  source text,
  last_updated timestamptz,
  distance_km double precision
)
language sql
stable
as $$
  with search_center as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as center
  ),
  nearby_providers as (
    select
      pr.id,
      pr.name,
      pr.address,
      pr.city,
      pr.state,
      pr.zip,
      pr.lat,
      pr.lng,
      pr.phone,
      pr.website,
      pr.provider_type,
      st_distance(pr.location, sc.center) / 1000 as distance_km
    from providers pr
    cross join search_center sc
    where
      pr.location is not null
      and st_dwithin(pr.location, sc.center, p_radius_km * 1000)
    order by distance_km asc
    limit greatest(coalesce(p_provider_limit, 300), 1)
  )
  select
    c.id,
    np.id as provider_id,
    np.name as provider_name,
    np.address as provider_address,
    np.city as provider_city,
    np.state as provider_state,
    np.zip as provider_zip,
    np.lat as provider_lat,
    np.lng as provider_lng,
    np.phone as provider_phone,
    np.website as provider_website,
    np.provider_type,
    c.description,
    c.setting,
    c.billing_class,
    c.laterality,
    c.cpt,
    c.hcpcs,
    c.ms_drg,
    c.gross_charge,
    c.cash_price,
    c.min_price,
    c.max_price,
    c.avg_negotiated_rate,
    c.min_negotiated_rate,
    c.max_negotiated_rate,
    c.payer_count,
    c.source,
    c.last_updated,
    np.distance_km
  from nearby_providers np
  join charges c on c.provider_id = np.id
  where
    (
      (p_code_type = 'cpt' and (c.cpt = any(p_codes) or c.hcpcs = any(p_codes)))
      or (p_code_type = 'hcpcs' and c.hcpcs = any(p_codes))
      or (p_code_type = 'ms_drg' and c.ms_drg = any(p_codes))
    )
    and (p_laterality is null or c.laterality = p_laterality)
  order by np.distance_km asc, c.cash_price asc nulls last
  limit greatest(coalesce(p_limit, 600), 1);
$$;

-- ============================================================================
-- RPC: search_charges_by_description()
-- Fallback text search when CPT code lookup returns zero results.
-- Uses PostgreSQL full-text search on charge descriptions.
-- ============================================================================
create or replace function search_charges_by_description(
  p_search_terms text,          -- Space-separated search keywords
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40,
  p_limit integer default 120,
  p_provider_limit integer default 300
)
returns table (
  id uuid,
  provider_id uuid,
  provider_name text,
  provider_address text,
  provider_city text,
  provider_state text,
  provider_zip text,
  provider_lat double precision,
  provider_lng double precision,
  provider_phone text,
  provider_website text,
  provider_type text,
  description text,
  setting text,
  billing_class text,
  laterality text,
  cpt text,
  hcpcs text,
  ms_drg text,
  gross_charge numeric,
  cash_price numeric,
  min_price numeric,
  max_price numeric,
  avg_negotiated_rate numeric,
  min_negotiated_rate numeric,
  max_negotiated_rate numeric,
  payer_count integer,
  source text,
  last_updated timestamptz,
  distance_km double precision,
  search_rank real
)
language sql
stable
as $$
  with search_center as (
    select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as center
  ),
  query_terms as (
    select plainto_tsquery('english', p_search_terms) as ts_query
  ),
  nearby_providers as (
    select
      pr.id,
      pr.name,
      pr.address,
      pr.city,
      pr.state,
      pr.zip,
      pr.lat,
      pr.lng,
      pr.phone,
      pr.website,
      pr.provider_type,
      st_distance(pr.location, sc.center) / 1000 as distance_km
    from providers pr
    cross join search_center sc
    where
      pr.location is not null
      and st_dwithin(pr.location, sc.center, p_radius_km * 1000)
    order by distance_km asc
    limit greatest(coalesce(p_provider_limit, 300), 1)
  )
  select
    c.id,
    np.id as provider_id,
    np.name as provider_name,
    np.address as provider_address,
    np.city as provider_city,
    np.state as provider_state,
    np.zip as provider_zip,
    np.lat as provider_lat,
    np.lng as provider_lng,
    np.phone as provider_phone,
    np.website as provider_website,
    np.provider_type,
    c.description,
    c.setting,
    c.billing_class,
    c.laterality,
    c.cpt,
    c.hcpcs,
    c.ms_drg,
    c.gross_charge,
    c.cash_price,
    c.min_price,
    c.max_price,
    c.avg_negotiated_rate,
    c.min_negotiated_rate,
    c.max_negotiated_rate,
    c.payer_count,
    c.source,
    c.last_updated,
    np.distance_km,
    ts_rank(
      to_tsvector('english', coalesce(c.description, '')),
      qt.ts_query
    ) as search_rank
  from nearby_providers np
  join charges c on c.provider_id = np.id
  cross join query_terms qt
  where
    to_tsvector('english', coalesce(c.description, '')) @@ qt.ts_query
  order by search_rank desc, np.distance_km asc, c.cash_price asc nulls last
  limit greatest(coalesce(p_limit, 120), 1);
$$;

-- ============================================================================
-- RPC: Audit functions (used by scripts/db-audit.ts)
-- Server-side aggregation for data quality audits.
-- ============================================================================

create or replace function audit_provider_charge_counts()
returns table (provider_id uuid, charge_count bigint)
language sql stable
as $$
  select c.provider_id, count(*) as charge_count
  from charges c
  group by c.provider_id;
$$;

create or replace function audit_zero_price_by_state()
returns table (state text, zero_price_count bigint)
language sql stable
as $$
  select
    coalesce(upper(trim(p.state)), 'UNKNOWN') as state,
    count(*) as zero_price_count
  from charges c
  join providers p on p.id = c.provider_id
  where c.cash_price is null
    and c.min_price is null
    and c.max_price is null
    and c.avg_negotiated_rate is null
  group by coalesce(upper(trim(p.state)), 'UNKNOWN');
$$;

create or replace function audit_orphan_charges()
returns bigint
language sql stable
as $$
  select count(*)
  from charges c
  where not exists (
    select 1 from providers p where p.id = c.provider_id
  );
$$;

create or replace function audit_code_coverage(p_codes text[])
returns table (code text, match_count bigint)
language sql stable
as $$
  with code_hits as (
    select cpt as matched_code, count(*) as cnt
    from charges where cpt = any(p_codes) group by cpt
    union all
    select hcpcs as matched_code, count(*) as cnt
    from charges where hcpcs = any(p_codes) group by hcpcs
  )
  select u.code, coalesce(sum(ch.cnt), 0) as match_count
  from unnest(p_codes) as u(code)
  left join code_hits ch on ch.matched_code = u.code
  group by u.code;
$$;

create or replace function audit_duplicate_charges(p_provider_ids uuid[])
returns table (
  provider_id uuid, provider_name text,
  code_value text, cash_price numeric, occurrences bigint
)
language sql stable
as $$
  with duplicates as (
    select
      c.provider_id,
      coalesce(nullif(trim(c.cpt), ''), nullif(trim(c.hcpcs), '')) as code_value,
      c.cash_price,
      count(*) as occurrences
    from charges c
    where c.provider_id = any(p_provider_ids)
      and (coalesce(nullif(trim(c.cpt), ''), nullif(trim(c.hcpcs), '')) is not null)
    group by
      c.provider_id,
      coalesce(nullif(trim(c.cpt), ''), nullif(trim(c.hcpcs), '')),
      c.cash_price
    having count(*) > 1
  )
  select
    d.provider_id,
    p.name as provider_name,
    d.code_value,
    d.cash_price,
    d.occurrences
  from duplicates d
  join providers p on p.id = d.provider_id
  order by d.occurrences desc;
$$;

create index if not exists idx_charges_all_prices_null
on charges (provider_id)
where cash_price is null and min_price is null
  and max_price is null and avg_negotiated_rate is null;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Saved searches: users can only access their own
alter table saved_searches enable row level security;

create policy "Users can view their own saved searches"
  on saved_searches for select
  using (auth.uid() = user_id);

create policy "Users can insert their own saved searches"
  on saved_searches for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved searches"
  on saved_searches for delete
  using (auth.uid() = user_id);

-- Public read access for providers, charges, payer_rates, and payers
alter table providers enable row level security;
alter table charges enable row level security;
alter table payer_rates enable row level security;
alter table payers enable row level security;
alter table translation_cache enable row level security;

create policy "Anyone can view providers" on providers for select using (true);
create policy "Anyone can view charges" on charges for select using (true);
create policy "Anyone can view payer rates" on payer_rates for select using (true);
create policy "Anyone can view payers" on payers for select using (true);
create policy "Anyone can view translation cache" on translation_cache for select using (true);
create policy "Anyone can insert translation cache" on translation_cache for insert with check (true);
create policy "Anyone can update translation cache" on translation_cache for update using (true) with check (true);
