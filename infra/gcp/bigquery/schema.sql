-- ClearCost BigQuery schema (proof-of-concept draft, not applied anywhere).
-- See docs/gcp-migration/README.md, section 1.
--
-- Replace `clearcost_poc` with your dataset and `<bucket>` with your GCS bucket.
-- BigQuery cannot partition on a STRING column, so "partition by state" uses an
-- integer state FIPS code with RANGE_BUCKET. Clustering does the code pruning.

-- ============================================================================
-- 1. Raw landing table: Oria standard_charges Parquet, loaded as-is.
--    Column names follow the DuckDB source read by lib/data/import-trilliant.ts.
-- ============================================================================
-- bq load --source_format=PARQUET --replace \
--   clearcost_poc.raw_standard_charges 'gs://<bucket>/raw/<load_id>/standard_charges/*.parquet'
-- bq load --source_format=PARQUET --replace \
--   clearcost_poc.raw_hospitals 'gs://<bucket>/raw/<load_id>/hospitals/*.parquet'

-- Alternatively, query Parquet in place without loading (slower, no clustering):
create or replace external table clearcost_poc.ext_standard_charges
options (
  format = 'PARQUET',
  uris = ['gs://<bucket>/raw/current/standard_charges/*.parquet']
);

-- ============================================================================
-- 2. State FIPS lookup (two-letter code -> integer partition key).
--    Populate once from the Census FIPS list (50 states + DC + territories).
-- ============================================================================
create table if not exists clearcost_poc.state_fips (
  state string not null,      -- 'NY'
  state_fips int64 not null,  -- 36
  -- Bounding box, used by the app to find every state a search circle touches.
  min_lat float64,
  max_lat float64,
  min_lng float64,
  max_lng float64
);

-- ============================================================================
-- 3. Serving-shaped charges table: one row per charge, provider denormalized.
-- ============================================================================
create table if not exists clearcost_poc.charges (
  load_id string not null,              -- Ingest run that produced this row
  charge_id string not null,
  provider_id int64 not null,           -- Oria hospital_id
  provider_npi string,
  provider_name string,
  provider_address string,
  provider_city string,
  state string,
  state_fips int64,
  zip string,
  lat float64,
  lng float64,
  location geography,                   -- ST_GEOGPOINT(lng, lat)

  -- Normalized code for clustering. The Postgres RPC checks cpt OR hcpcs because
  -- hospitals file CPT codes in either column; here it is resolved once at load.
  billing_code string not null,
  code_type string not null,            -- 'cpt' | 'hcpcs' | 'ms_drg'
  cpt string,
  hcpcs string,
  ms_drg string,
  revenue_code string,
  modifiers string,
  laterality string,
  body_site string,

  description string,
  setting string,
  billing_class string,

  -- NUMERIC, not FLOAT64, so cents don't drift in bundle totals.
  gross_charge numeric,
  cash_price numeric,
  min_price numeric,
  max_price numeric,
  avg_negotiated_rate numeric,
  min_negotiated_rate numeric,
  max_negotiated_rate numeric,
  payer_count int64,

  source string,
  last_updated timestamp
)
partition by range_bucket(state_fips, generate_array(1, 80, 1))
cluster by billing_code, provider_id
options (
  require_partition_filter = true,
  description = 'ClearCost charges, partitioned by state FIPS, clustered by billing code'
);

-- Alternative to benchmark: no partitioning, cluster by (state, billing_code,
-- provider_id). With ~50 very uneven states this often prunes as well.
-- create table clearcost_poc.charges_clustered_only (...same columns...)
-- cluster by state, billing_code, provider_id;

-- ============================================================================
-- 4. Payer-specific rates (the 6.4B-row table). Not in the hot path.
-- ============================================================================
create table if not exists clearcost_poc.payer_rates (
  load_id string not null,
  charge_id string not null,
  provider_id int64 not null,
  state_fips int64,
  billing_code string not null,
  payer_name string not null,
  plan_name string,
  rate numeric,
  methodology string
)
partition by range_bucket(state_fips, generate_array(1, 80, 1))
cluster by billing_code, payer_name, provider_id;

-- ============================================================================
-- 5. Transform raw -> charges for one load.
--    Mirrors the code filter and dedup from import-trilliant.ts / scripts/.
-- ============================================================================
-- declare v_load_id string default '<load_id>';
-- insert into clearcost_poc.charges (...)
-- select
--   v_load_id,
--   cast(sc.charge_id as string),
--   sc.hospital_id,
--   h.npi, h.hospital_name, h.hospital_address, h.hospital_city,
--   upper(h.hospital_state), f.state_fips, h.zip, h.lat, h.lng,
--   st_geogpoint(h.lng, h.lat),
--   coalesce(sc.cpt, sc.hcpcs, sc.ms_drg) as billing_code,
--   case when sc.cpt is not null or regexp_contains(sc.hcpcs, r'^\d{4}[0-9A-Z]$') then 'cpt'
--        when sc.hcpcs is not null then 'hcpcs' else 'ms_drg' end,
--   ...
-- from clearcost_poc.raw_standard_charges sc
-- join clearcost_poc.raw_hospitals h using (hospital_id)
-- join clearcost_poc.state_fips f on f.state = upper(h.hospital_state)
-- where h.status = 'completed'
-- qualify row_number() over (
--   partition by sc.hospital_id, billing_code, sc.setting, sc.billing_class,
--                sc.modifiers, sc.gross_charge, sc.discounted_cash
--   order by sc.charge_id) = 1;

-- Atomic cutover: the app only reads the view.
create or replace view clearcost_poc.charges_current as
select * from clearcost_poc.charges
where load_id = '<current_load_id>';

-- ============================================================================
-- 6. Hot-path query: equivalent of search_charges_nearby() in one statement.
--    @state_fips is every state whose bbox intersects the search circle,
--    computed in the app. Without it, require_partition_filter rejects the query.
--    Run with maximumBytesBilled set, and jobCreationMode=JOB_CREATION_OPTIONAL.
-- ============================================================================
-- declare center geography default st_geogpoint(@lng, @lat);
select
  c.charge_id,
  c.provider_id,
  c.provider_name,
  c.provider_city,
  c.state,
  c.billing_code,
  c.description,
  c.setting,
  c.billing_class,
  c.laterality,
  c.cash_price,
  c.gross_charge,
  c.min_negotiated_rate,
  c.max_negotiated_rate,
  st_distance(c.location, st_geogpoint(@lng, @lat)) / 1000 as distance_km
from clearcost_poc.charges_current c
where c.state_fips in unnest(@state_fips)
  and c.billing_code in unnest(@codes)
  and st_dwithin(c.location, st_geogpoint(@lng, @lat), @radius_km * 1000)
  and (@laterality is null or c.laterality = @laterality)
order by distance_km, c.cash_price is null, c.cash_price
limit 600;

-- ============================================================================
-- 7. Top-bundle price cards for the cache / SEO pages / agent API.
--    One row per (bundle, metro, provider). Exported to GCS as JSON.
-- ============================================================================
-- create or replace table clearcost_poc.price_cards as
-- select b.bundle_id, m.metro_slug, c.provider_id, c.provider_name,
--        sum(c.cash_price) as bundle_cash_price, count(*) as codes_priced
-- from clearcost_poc.top_bundles b
-- join clearcost_poc.charges_current c on c.billing_code in unnest(b.codes)
-- join clearcost_poc.metros m on st_dwithin(c.location, m.center, m.radius_m)
-- where c.state_fips in unnest(m.state_fips)
-- group by 1, 2, 3, 4;
-- EXPORT DATA OPTIONS (uri = 'gs://<bucket>/price-cards/<load_id>/*.json', format = 'JSON')
-- AS select * from clearcost_poc.price_cards;
