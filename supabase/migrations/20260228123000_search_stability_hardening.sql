-- Search stability hardening:
-- 1) provider-first indexes for nearby-provider query shape
-- 2) translation cache table for deterministic query reuse
-- 3) rewritten RPCs with nearby_providers CTE + row limits
-- 4) ANALYZE refresh to improve planner quality

create index if not exists idx_charges_provider_cpt on charges (provider_id, cpt);
create index if not exists idx_charges_provider_hcpcs on charges (provider_id, hcpcs);
create index if not exists idx_charges_provider_ms_drg on charges (provider_id, ms_drg);

create table if not exists translation_cache (
  query_hash text primary key,
  normalized_query text not null,
  payload jsonb not null,
  hit_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_translation_cache_updated_at on translation_cache (updated_at desc);
alter table translation_cache enable row level security;
drop policy if exists "Anyone can view translation cache" on translation_cache;
drop policy if exists "Anyone can insert translation cache" on translation_cache;
drop policy if exists "Anyone can update translation cache" on translation_cache;
create policy "Anyone can view translation cache" on translation_cache for select using (true);
create policy "Anyone can insert translation cache" on translation_cache for insert with check (true);
create policy "Anyone can update translation cache" on translation_cache for update using (true) with check (true);

drop function if exists search_charges_nearby(text, text[], double precision, double precision, double precision);
drop function if exists search_charges_nearby(text, text[], double precision, double precision, double precision, integer, integer);

create function search_charges_nearby(
  p_code_type text,
  p_codes text[],
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40,
  p_limit integer default 600,
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
  order by np.distance_km asc, c.cash_price asc nulls last
  limit greatest(coalesce(p_limit, 600), 1);
$$;

drop function if exists search_charges_by_description(text, double precision, double precision, double precision, integer);
drop function if exists search_charges_by_description(text, double precision, double precision, double precision, integer, integer);

create function search_charges_by_description(
  p_search_terms text,
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

analyze providers;
analyze charges;
