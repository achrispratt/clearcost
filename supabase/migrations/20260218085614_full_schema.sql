-- ============================================================================
-- ClearCost Full Migration
-- Step 1: Drop old tables and functions
-- Step 2: Create new schema
--
-- Paste this into the Supabase SQL Editor and click "Run"
-- ============================================================================

-- STEP 1: Drop old objects
-- Drop functions first
drop function if exists search_prices_nearby cascade;
drop function if exists search_charges_nearby cascade;
drop function if exists search_charges_by_description cascade;
-- Drop tables with CASCADE (automatically removes dependent policies and indexes)
drop table if exists negotiated_rates cascade;
drop table if exists payer_rates cascade;
drop table if exists prices cascade;
drop table if exists charges cascade;
drop table if exists hospitals cascade;
drop table if exists providers cascade;
drop table if exists payers cascade;
drop table if exists saved_searches cascade;

-- STEP 2: Enable PostGIS
create extension if not exists postgis;

-- STEP 3: Create tables
-- ============================================================================
-- PROVIDERS (hospitals, imaging centers, labs, ASCs, clinics)
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
  provider_type text,
  npi text unique,
  trilliant_hospital_id bigint unique,
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
-- ============================================================================
create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  description text,
  setting text,
  billing_class text,
  cpt text,
  hcpcs text,
  ms_drg text,
  revenue_code text,
  ndc text,
  icd text,
  modifiers text,
  gross_charge numeric(12, 2),
  cash_price numeric(12, 2),
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  avg_negotiated_rate numeric(12, 2),
  min_negotiated_rate numeric(12, 2),
  max_negotiated_rate numeric(12, 2),
  payer_count integer default 0,
  source text default 'trilliant_oria',
  last_updated timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_charges_cpt on charges (cpt);
create index if not exists idx_charges_hcpcs on charges (hcpcs);
create index if not exists idx_charges_ms_drg on charges (ms_drg);
create index if not exists idx_charges_provider on charges (provider_id);
create index if not exists idx_charges_cpt_provider on charges (cpt, provider_id);
create index if not exists idx_charges_hcpcs_provider on charges (hcpcs, provider_id);
create index if not exists idx_charges_description on charges using gin (to_tsvector('english', coalesce(description, '')));

-- ============================================================================
-- PAYER RATES (insurance-specific negotiated rates)
-- ============================================================================
create table if not exists payer_rates (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id) on delete cascade,
  payer_name text not null,
  plan_name text,
  rate numeric(12, 2),
  methodology text,
  created_at timestamptz default now()
);

create index if not exists idx_payer_rates_charge on payer_rates (charge_id);
create index if not exists idx_payer_rates_payer on payer_rates (payer_name);

-- ============================================================================
-- PAYERS (canonical payer list for UI dropdown)
-- ============================================================================
create table if not exists payers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  display_name text not null,
  created_at timestamptz default now()
);

-- ============================================================================
-- SAVED SEARCHES (user bookmarks with coordinates)
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

-- STEP 4: Create RPC functions
-- ============================================================================
-- search_charges_nearby() — main code-based search
-- ============================================================================
create or replace function search_charges_nearby(
  p_code_type text,
  p_codes text[],
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40
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
  select
    c.id,
    pr.id as provider_id,
    pr.name as provider_name,
    pr.address as provider_address,
    pr.city as provider_city,
    pr.state as provider_state,
    pr.zip as provider_zip,
    pr.lat as provider_lat,
    pr.lng as provider_lng,
    pr.phone as provider_phone,
    pr.website as provider_website,
    pr.provider_type,
    c.description,
    c.setting,
    c.billing_class,
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
    st_distance(
      pr.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) / 1000 as distance_km
  from charges c
  join providers pr on c.provider_id = pr.id
  where
    pr.location is not null
    and st_dwithin(
      pr.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    and (
      (p_code_type = 'cpt' and (c.cpt = any(p_codes) or c.hcpcs = any(p_codes)))
      or (p_code_type = 'hcpcs' and c.hcpcs = any(p_codes))
      or (p_code_type = 'ms_drg' and c.ms_drg = any(p_codes))
    )
  order by c.cash_price asc nulls last;
$$;

-- ============================================================================
-- search_charges_by_description() — fallback text search
-- ============================================================================
create or replace function search_charges_by_description(
  p_search_terms text,
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40,
  p_limit integer default 50
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
  select
    c.id,
    pr.id as provider_id,
    pr.name as provider_name,
    pr.address as provider_address,
    pr.city as provider_city,
    pr.state as provider_state,
    pr.zip as provider_zip,
    pr.lat as provider_lat,
    pr.lng as provider_lng,
    pr.phone as provider_phone,
    pr.website as provider_website,
    pr.provider_type,
    c.description,
    c.setting,
    c.billing_class,
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
    st_distance(
      pr.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    ) / 1000 as distance_km,
    ts_rank(
      to_tsvector('english', coalesce(c.description, '')),
      plainto_tsquery('english', p_search_terms)
    ) as search_rank
  from charges c
  join providers pr on c.provider_id = pr.id
  where
    pr.location is not null
    and st_dwithin(
      pr.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
    and to_tsvector('english', coalesce(c.description, '')) @@ plainto_tsquery('english', p_search_terms)
  order by search_rank desc, c.cash_price asc nulls last
  limit p_limit;
$$;

-- STEP 5: Row Level Security
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

alter table providers enable row level security;
alter table charges enable row level security;
alter table payer_rates enable row level security;
alter table payers enable row level security;

create policy "Anyone can view providers" on providers for select using (true);
create policy "Anyone can view charges" on charges for select using (true);
create policy "Anyone can view payer rates" on payer_rates for select using (true);
create policy "Anyone can view payers" on payers for select using (true);

-- ============================================================================
-- DONE! Verify by checking:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ============================================================================
select 'Migration complete! Tables created: providers, charges, payer_rates, payers, saved_searches' as result;
