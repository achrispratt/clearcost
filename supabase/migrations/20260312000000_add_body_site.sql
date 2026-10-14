-- Body-site column, index and parser (issue #51), plus the search RPCs that
-- return and filter by it. This was run by hand in the SQL editor (first draft
-- in scripts/migration-body-site.sql) before it was tracked, and it is marked
-- applied. The parser and RPC bodies match production's live definitions; their
-- search_path is pinned later in 20261013175002_security_hardening.sql.
-- The index is built without CONCURRENTLY so it can run inside a migration transaction.

ALTER TABLE charges ADD COLUMN IF NOT EXISTS body_site text;

CREATE INDEX IF NOT EXISTS idx_charges_body_site
  ON charges (body_site) WHERE body_site IS NOT NULL;

-- Mirrors the TypeScript parseBodySite() in lib/cpt/parse-body-site.ts.
-- Uses Postgres \m (start-of-word) and \M (end-of-word) boundaries.
CREATE OR REPLACE FUNCTION parse_body_site(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
declare
  v_desc text;
begin
  if p_description is null then return null; end if;
  v_desc := upper(p_description);

  if v_desc ~ '\mLOW(ER)?\s+EXTREMITY\s+JOINT\M' then return null; end if;
  if v_desc ~ '\mUPPER\s+EXTREMITY\s+JOINT\M' then return null; end if;
  if v_desc ~ '\mANY\s+JOINT\M' then return null; end if;

  if v_desc ~ '\mKNEE\M' then return 'knee'; end if;
  if v_desc ~ '\mHIP\M' then return 'hip'; end if;
  if v_desc ~ '\mANKLE\M' then return 'ankle'; end if;
  if v_desc ~ '\mSHOULDER\M' then return 'shoulder'; end if;
  if v_desc ~ '\mELBOW\M' then return 'elbow'; end if;
  if v_desc ~ '\mWRIST\M' then return 'wrist'; end if;
  if v_desc ~ '\mHAND\M' then return 'hand'; end if;
  if v_desc ~ '\mFOOT\M' or v_desc ~ '\mFEET\M' then return 'foot'; end if;

  if v_desc ~ '\mCERVICAL\M' or v_desc ~ '\mC[\s-]?SPINE\M' then return 'cervical_spine'; end if;
  if v_desc ~ '\mTHORACIC\M' or v_desc ~ '\mT[\s-]?SPINE\M' then return 'thoracic_spine'; end if;
  if v_desc ~ '\mLUMBAR\M' or v_desc ~ '\mL[\s-]?SPINE\M' then return 'lumbar_spine'; end if;
  if v_desc ~ '\mSACRAL\M' or v_desc ~ '\mSACRUM\M' then return 'sacral_spine'; end if;

  if v_desc ~ '\mCHEST\M' then return 'chest'; end if;
  if v_desc ~ '\mABDOMEN\M' or v_desc ~ '\mABDOMINAL\M' then return 'abdomen'; end if;
  if v_desc ~ '\mPELVI[SC]\M' then return 'pelvis'; end if;

  if v_desc ~ '\mHEAD\M' or v_desc ~ '\mBRAIN\M' or v_desc ~ '\mCRANIAL\M' then return 'head'; end if;
  if v_desc ~ '\mNECK\M' then return 'neck'; end if;

  return null;
end;
$function$;

-- The RPCs' return types change, so they are dropped and recreated.
drop function if exists search_charges_nearby(text, text[], double precision, double precision, double precision, integer, integer, text);
drop function if exists search_charges_by_description(text, double precision, double precision, double precision, integer, integer);

create function search_charges_nearby(
  p_code_type text,
  p_codes text[],
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 40,
  p_limit integer default 600,
  p_provider_limit integer default 300,
  p_laterality text default null,
  p_body_site text default null
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
  body_site text,
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
    c.body_site,
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
    and (p_body_site is null or c.body_site = p_body_site)
  order by np.distance_km asc, c.cash_price asc nulls last
  limit greatest(coalesce(p_limit, 600), 1);
$$;

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
  laterality text,
  body_site text,
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
    c.body_site,
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
