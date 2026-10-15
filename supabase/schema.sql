-- ClearCost Database Schema
-- Run this in the Supabase SQL editor to set up your database.
-- Supports national coverage, all billing code types (CPT, HCPCS, MS-DRG, ICD, NDC, Revenue Code).

-- Enable PostGIS for geographic queries
create extension if not exists postgis;
-- NOTE: PostGIS creates `spatial_ref_sys` in public without RLS.
-- Supabase's linter flags this, but the table is owned by supabase_admin
-- and cannot be altered. Safe to ignore — contains only public coordinate
-- system definitions (EPSG codes). See: https://supabase.com/docs/guides/database/extensions/postgis

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
  body_site text,      -- 'knee', 'hip', 'shoulder', etc., or null (parsed from description)

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
  imported_at timestamptz default now(), -- When this row was imported (NULL for pre-tracking rows)
  source_charge_id bigint,             -- Oria standard_charges.charge_id; import upserts on it (NULL for pre-#59 rows)
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
create index if not exists idx_charges_body_site on charges (body_site) where body_site is not null;
create unique index if not exists idx_charges_source_charge_id on charges (source_charge_id) where source_charge_id is not null;

-- ============================================================================
-- Laterality parser (SQL mirror of lib/cpt/parse-laterality.ts)
-- ============================================================================
create or replace function parse_laterality(
  p_description text,
  p_modifiers text
)
returns text
language plpgsql
immutable
as $$
declare
  v_desc text;
  v_mods text;
begin
  v_mods := upper(p_modifiers);
  v_desc := upper(p_description);

  -- Modifiers take priority
  if v_mods is not null then
    if v_mods ~ '\m50\M' then return 'bilateral'; end if;
    if v_mods ~ '\mLT\M' then return 'left'; end if;
    if v_mods ~ '\mRT\M' then return 'right'; end if;
  end if;

  -- Fall back to description
  if v_desc is not null then
    if v_desc ~ '\mLT\M' then return 'left'; end if;
    if v_desc ~ '\mRT\M' then return 'right'; end if;
    if v_desc ~ '\mBILATERAL\M' or v_desc ~ '\mBILAT\M' then return 'bilateral'; end if;
    if v_desc ~ '\mLEFT\M' then return 'left'; end if;
    if v_desc ~ '\mRIGHT\M' then return 'right'; end if;
  end if;

  return null;
end;
$$;

-- ============================================================================
-- Body-site parser (SQL mirror of lib/cpt/parse-body-site.ts)
-- ============================================================================
create or replace function parse_body_site(p_description text)
returns text
language plpgsql
immutable
as $$
declare
  v_desc text;
begin
  if p_description is null then return null; end if;
  v_desc := upper(p_description);

  -- Generic exclusions (must come first)
  if v_desc ~ '\mLOW(ER)?\s+EXTREMITY\s+JOINT\M' then return null; end if;
  if v_desc ~ '\mUPPER\s+EXTREMITY\s+JOINT\M' then return null; end if;
  if v_desc ~ '\mANY\s+JOINT\M' then return null; end if;

  -- Joints (most specific first)
  if v_desc ~ '\mKNEE\M' then return 'knee'; end if;
  if v_desc ~ '\mHIP\M' then return 'hip'; end if;
  if v_desc ~ '\mANKLE\M' then return 'ankle'; end if;
  if v_desc ~ '\mSHOULDER\M' then return 'shoulder'; end if;
  if v_desc ~ '\mELBOW\M' then return 'elbow'; end if;
  if v_desc ~ '\mWRIST\M' then return 'wrist'; end if;
  if v_desc ~ '\mHAND\M' then return 'hand'; end if;
  if v_desc ~ '\mFOOT\M' or v_desc ~ '\mFEET\M' then return 'foot'; end if;

  -- Spine segments
  if v_desc ~ '\mCERVICAL\M' or v_desc ~ '\mC[\s-]?SPINE\M' then return 'cervical_spine'; end if;
  if v_desc ~ '\mTHORACIC\M' or v_desc ~ '\mT[\s-]?SPINE\M' then return 'thoracic_spine'; end if;
  if v_desc ~ '\mLUMBAR\M' or v_desc ~ '\mL[\s-]?SPINE\M' then return 'lumbar_spine'; end if;
  if v_desc ~ '\mSACRAL\M' or v_desc ~ '\mSACRUM\M' then return 'sacral_spine'; end if;

  -- Torso/body regions
  if v_desc ~ '\mCHEST\M' then return 'chest'; end if;
  if v_desc ~ '\mABDOMEN\M' or v_desc ~ '\mABDOMINAL\M' then return 'abdomen'; end if;
  if v_desc ~ '\mPELVI[SC]\M' then return 'pelvis'; end if;

  -- Head/neck
  if v_desc ~ '\mHEAD\M' or v_desc ~ '\mBRAIN\M' or v_desc ~ '\mCRANIAL\M' then return 'head'; end if;
  if v_desc ~ '\mNECK\M' then return 'neck'; end if;

  return null;
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
-- KB: SYNONYMS (query normalization — many surface forms → one canonical query)
-- ============================================================================
create table if not exists kb_synonyms (
  query_hash       text primary key,
  normalized_query text not null,
  canonical_query  text not null,
  created_at       timestamptz default now()
);

create index if not exists idx_kb_synonyms_canonical on kb_synonyms (canonical_query);

-- ============================================================================
-- KB: NODES (one node per canonical_query + answer_path combination)
-- node_type='question'   → AI responded with a clarifying question
-- node_type='resolution' → AI resolved to billing codes (terminal node)
-- ============================================================================
create table if not exists kb_nodes (
  path_hash       text primary key,
  canonical_query text not null,
  answer_path     text[] not null default '{}',
  depth           integer not null default 0,
  node_type       text not null,
  payload         jsonb not null,
  hit_count       integer not null default 0,
  version         integer not null default 1,
  source          text not null default 'claude',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  flagged_at      timestamptz,             -- set by kb_flag_resolution_nodes(); served as a KB miss
  flag_reason     text,
  replaced_at     timestamptz,             -- when this version replaced a flagged one
  constraint chk_kb_nodes_node_type check (node_type in ('question', 'resolution')),
  constraint chk_kb_nodes_source     check (source    in ('claude', 'admin', 'migrated'))
);

create index if not exists idx_kb_nodes_canonical on kb_nodes (canonical_query);
create index if not exists idx_kb_nodes_flagged on kb_nodes (flagged_at) where flagged_at is not null;

-- ============================================================================
-- KB: EVENTS (interaction telemetry per session × path)
-- 'miss' is logged server-side when /api/clarify falls through to Claude on
-- the first turn; for those rows path_hash holds the query_hash (kb_synonyms
-- key), not a node hash.
-- ============================================================================
create table if not exists kb_events (
  id         uuid primary key default gen_random_uuid(),
  path_hash  text not null,
  event_type text not null,
  session_id text not null,
  created_at timestamptz default now(),
  constraint chk_kb_events_event_type check (
    event_type in ('walk', 'result_click', 'save', 'bounce', 'skip', 'miss')
  )
);

create index if not exists idx_kb_events_created_at on kb_events (created_at desc);
create index if not exists idx_kb_events_path_hash  on kb_events (path_hash);

-- ============================================================================
-- KB: PATH STATS (aggregates per path × calendar month, distinct sessions)
-- Refreshed daily by kb_rollup_path_stats() via pg_cron (see KB JOBS below).
-- ============================================================================
create table if not exists kb_path_stats (
  path_hash    text not null,
  period       date not null,
  walk_count   integer not null default 0,
  click_count  integer not null default 0,
  save_count   integer not null default 0,
  bounce_count integer not null default 0,
  skip_count   integer not null default 0,
  constraint pk_kb_path_stats primary key (path_hash, period)
);

-- ============================================================================
-- KB: NODE HISTORY + JOBS (#125, #126, #127)
-- ============================================================================
create extension if not exists pg_cron with schema pg_catalog;

-- Previous versions of replaced nodes, kept for comparison and rollback.
create table if not exists public.kb_node_history (
  id            bigint generated always as identity primary key,
  path_hash     text not null,
  version       integer not null,
  canonical_query text not null,
  answer_path   text[] not null,
  depth         integer not null,
  node_type     text not null,
  payload       jsonb not null,
  source        text not null,
  hit_count     integer not null,
  flagged_at    timestamptz,
  flag_reason   text,
  created_at    timestamptz,             -- when this version was first written
  archived_at   timestamptz not null default now()
);

create index if not exists idx_kb_node_history_path
  on public.kb_node_history (path_hash, version);

alter table public.kb_node_history enable row level security;
revoke all on public.kb_node_history from anon, authenticated;

-- ============================================================================
-- Roll-up: kb_events -> kb_path_stats
-- Counts are DISTINCT SESSIONS per event type (a user clicking five hospitals
-- is one click-through, not five), so rates per walk stay meaningful.
-- Re-running recomputes each month from scratch, so it is idempotent as long
-- as the month's events are complete -- which kb_purge_old_events guarantees
-- by only deleting whole months.
-- ============================================================================
create or replace function public.kb_rollup_path_stats(p_from timestamptz default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from timestamptz := date_trunc(
    'month', coalesce(p_from, now() - interval '1 month')
  );
  affected integer;
begin
  insert into kb_path_stats
    (path_hash, period, walk_count, click_count, save_count, bounce_count, skip_count)
  select
    path_hash,
    date_trunc('month', created_at)::date as period,
    count(distinct session_id) filter (where event_type = 'walk'),
    count(distinct session_id) filter (where event_type = 'result_click'),
    count(distinct session_id) filter (where event_type = 'save'),
    count(distinct session_id) filter (where event_type = 'bounce'),
    count(distinct session_id) filter (where event_type = 'skip')
  from kb_events
  where created_at >= v_from
    and event_type in ('walk', 'result_click', 'save', 'bounce', 'skip')
  group by path_hash, date_trunc('month', created_at)::date
  on conflict (path_hash, period) do update set
    walk_count   = excluded.walk_count,
    click_count  = excluded.click_count,
    save_count   = excluded.save_count,
    bounce_count = excluded.bounce_count,
    skip_count   = excluded.skip_count;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- ============================================================================
-- TTL: delete raw events once they are at least 30 days old AND their month
-- is before the previous month (so the daily roll-up has had the whole
-- following month to finalize it). Always cuts on a month boundary, so a
-- month is never left half-deleted, and rolls up everything it is about to
-- delete in the same transaction -- if the roll-up fails, nothing is deleted.
-- Effective retention: 30-62 days.
-- ============================================================================
create or replace function public.kb_purge_old_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz := least(
    date_trunc('month', now() - interval '30 days'),
    date_trunc('month', now()) - interval '1 month'
  );
  v_oldest timestamptz;
  deleted integer;
begin
  select min(created_at) into v_oldest from kb_events where created_at < v_cutoff;
  if v_oldest is null then
    return 0;
  end if;

  perform kb_rollup_path_stats(v_oldest);

  delete from kb_events where created_at < v_cutoff;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- ============================================================================
-- Confidence per resolution node per month (#126 starting formula):
--   confidence = click_rate*0.5 + save_rate*0.3 - bounce_rate*0.4 + ln(walks)*0.1
-- Rates are distinct sessions per walking session, capped at 1: results-page
-- events also arrive for sessions whose resolution came from Claude on the
-- same path (no walk logged), which could otherwise push a rate past 100%.
-- Null when the month has no walks.
-- ============================================================================
create or replace view public.kb_resolution_confidence
with (security_invoker = true) as
select
  s.path_hash,
  s.period,
  n.canonical_query,
  n.answer_path,
  n.version,
  n.flagged_at,
  s.walk_count,
  s.click_count,
  s.save_count,
  s.bounce_count,
  s.skip_count,
  r.click_rate,
  r.save_rate,
  r.bounce_rate,
  case when s.walk_count > 0 then
    round(
      r.click_rate * 0.5 + r.save_rate * 0.3 - r.bounce_rate * 0.4
        + ln(s.walk_count::numeric) * 0.1,
      4
    )
  end as confidence
from public.kb_path_stats s
join public.kb_nodes n on n.path_hash = s.path_hash and n.node_type = 'resolution'
cross join lateral (
  select
    case when s.walk_count > 0
      then round(least(1, s.click_count::numeric / s.walk_count), 4) end as click_rate,
    case when s.walk_count > 0
      then round(least(1, s.save_count::numeric / s.walk_count), 4) end as save_rate,
    case when s.walk_count > 0
      then round(least(1, s.bounce_count::numeric / s.walk_count), 4) end as bounce_rate
) r;

revoke all on public.kb_resolution_confidence from anon, authenticated;
grant select on public.kb_resolution_confidence to service_role;

-- ============================================================================
-- Auto-flag (#126): a resolution node is flagged when
--   walk_count >= p_min_walks in the current month
--   AND bounce_rate > p_bounce_threshold in the current month
--   AND bounce_rate rose month over month p_rising_months times in a row
--       (default 2: two months ago < last month < this month)
-- Only months after the node's last replacement count. Already-flagged nodes
-- are skipped. Returns the number of nodes flagged.
-- ============================================================================
create or replace function public.kb_flag_resolution_nodes(
  p_min_walks integer default 50,
  p_bounce_threshold numeric default 0.25,
  p_rising_months integer default 2
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current date := date_trunc('month', now())::date;
  v_window_start date := (date_trunc('month', now())
    - make_interval(months => p_rising_months))::date;
  flagged integer;
begin
  with monthly as (
    select c.path_hash, c.period, c.walk_count, c.bounce_rate
    from kb_resolution_confidence c
    join kb_nodes n on n.path_hash = c.path_hash
    where n.flagged_at is null
      and c.period between v_window_start and v_current
      and (n.replaced_at is null
           or c.period > date_trunc('month', n.replaced_at)::date)
  ),
  seq as (
    select path_hash, period, walk_count, bounce_rate,
      lag(bounce_rate) over (partition by path_hash order by period) as prev_rate
    from monthly
  ),
  candidates as (
    select
      path_hash,
      max(bounce_rate) filter (where period = v_current) as current_rate,
      max(walk_count) filter (where period = v_current) as current_walks
    from seq
    group by path_hash
    having count(*) = p_rising_months + 1
      and count(*) filter (
        where prev_rate is not null and bounce_rate > prev_rate
      ) = p_rising_months
      and bool_or(
        period = v_current
        and walk_count >= p_min_walks
        and bounce_rate > p_bounce_threshold
      )
  )
  update kb_nodes n
  set flagged_at = now(),
      flag_reason = format(
        'auto: bounce rate %s%% on %s walks this month, rising %s months in a row',
        round(c.current_rate * 100, 1), c.current_walks, p_rising_months
      )
  from candidates c
  where n.path_hash = c.path_hash
    and n.flagged_at is null;

  get diagnostics flagged = row_count;
  return flagged;
end;
$$;

-- ============================================================================
-- Replace a flagged node with a fresh answer (called by lib/kb/write-back.ts
-- after the first-write-wins upsert). Archives the old version into
-- kb_node_history and bumps version. No-op (returns false) if the node is
-- missing or not flagged, so ordinary write-backs can never overwrite a node.
-- ============================================================================
create or replace function public.kb_replace_flagged_node(
  p_path_hash text,
  p_canonical_query text,
  p_answer_path text[],
  p_depth integer,
  p_node_type text,
  p_payload jsonb,
  p_source text default 'claude'
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_node kb_nodes%rowtype;
begin
  select * into old_node
  from kb_nodes
  where path_hash = p_path_hash and flagged_at is not null
  for update;

  if not found then
    return false;
  end if;

  insert into kb_node_history (
    path_hash, version, canonical_query, answer_path, depth, node_type,
    payload, source, hit_count, flagged_at, flag_reason, created_at
  ) values (
    old_node.path_hash, old_node.version, old_node.canonical_query,
    old_node.answer_path, old_node.depth, old_node.node_type,
    old_node.payload, old_node.source, old_node.hit_count,
    old_node.flagged_at, old_node.flag_reason,
    coalesce(old_node.replaced_at, old_node.created_at)
  );

  update kb_nodes set
    canonical_query = p_canonical_query,
    answer_path     = p_answer_path,
    depth           = p_depth,
    node_type       = p_node_type,
    payload         = p_payload,
    source          = p_source,
    version         = old_node.version + 1,
    hit_count       = 0,
    flagged_at      = null,
    flag_reason     = null,
    replaced_at     = now(),
    updated_at      = now()
  where path_hash = p_path_hash;

  return true;
end;
$$;

-- Owned by postgres; callable only by the service role (and cron as postgres).
alter function public.kb_rollup_path_stats(timestamptz) owner to postgres;
alter function public.kb_purge_old_events() owner to postgres;
alter function public.kb_flag_resolution_nodes(integer, numeric, integer) owner to postgres;
alter function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  owner to postgres;

revoke execute on function public.kb_rollup_path_stats(timestamptz)
  from public, anon, authenticated;
revoke execute on function public.kb_purge_old_events()
  from public, anon, authenticated;
revoke execute on function public.kb_flag_resolution_nodes(integer, numeric, integer)
  from public, anon, authenticated;
revoke execute on function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.kb_rollup_path_stats(timestamptz) to service_role;
grant execute on function public.kb_purge_old_events() to service_role;
grant execute on function public.kb_flag_resolution_nodes(integer, numeric, integer) to service_role;
grant execute on function public.kb_replace_flagged_node(text, text, text[], integer, text, jsonb, text)
  to service_role;

-- ============================================================================
-- Schedules (UTC). cron.schedule upserts by job name, so re-running this
-- migration updates the jobs in place. Order matters: roll up, then flag,
-- then purge (which rolls up again before deleting anything).
-- The monthly roll-up from the original KB migration may have been scheduled
-- by hand; it counted raw events rather than sessions, so remove it.
-- ============================================================================
select cron.unschedule(jobid)
from cron.job
where jobname = 'kb-stats-rollup-monthly';

select cron.schedule(
  'kb-path-stats-rollup-daily',
  '0 3 * * *',
  $$select public.kb_rollup_path_stats()$$
);

select cron.schedule(
  'kb-flag-resolution-nodes-daily',
  '15 3 * * *',
  $$select public.kb_flag_resolution_nodes()$$
);

select cron.schedule(
  'kb-events-ttl-daily',
  '30 3 * * *',
  $$select public.kb_purge_old_events()$$
);

-- ============================================================================
-- MEDICARE BENCHMARKS (CMS Physician Fee Schedule national rates)
-- One row per billing code. Used as anchor pricing — "this hospital charges 3.2× Medicare."
-- ~800-1,000 rows (subset of our 1,002 curated codes that appear in the PFS).
-- MS-DRG codes use a different CMS dataset (IPPS) and are not included here.
-- ============================================================================
create table if not exists medicare_benchmarks (
  code              text primary key,
  description       text,
  facility_rate     numeric(10, 2),
  non_facility_rate numeric(10, 2),
  conversion_factor numeric(8, 4),
  pfs_year          smallint not null,
  status_code       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_medicare_benchmarks_code
  on medicare_benchmarks (code);

alter table medicare_benchmarks enable row level security;
create policy "Anyone can view medicare benchmarks"
  on medicare_benchmarks for select using (true);

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
  p_laterality text default null, -- 'left', 'right', 'bilateral', or null (no filter)
  p_body_site text default null  -- 'knee', 'hip', etc., or null (no filter)
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
      -- Some files put revenue codes in the DRG column (0460 pulmonary
      -- function shows up as DRG 460); a real DRG price is an inpatient stay.
      or (p_code_type = 'ms_drg' and c.ms_drg = any(p_codes)
          and lower(trim(c.setting)) = 'inpatient')
    )
    -- Rows the hospital didn't tag with a side or body site still apply to
    -- every side; only rows tagged for a different one are excluded (#176).
    and (p_laterality is null or c.laterality is null or c.laterality = p_laterality)
    and (p_body_site is null or c.body_site is null or c.body_site = p_body_site)
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

create policy "Anyone can view providers" on providers for select using (true);
create policy "Anyone can view charges" on charges for select using (true);
create policy "Anyone can view payer rates" on payer_rates for select using (true);
create policy "Anyone can view payers" on payers for select using (true);

-- KB tables RLS
alter table kb_synonyms   enable row level security;
alter table kb_nodes      enable row level security;
alter table kb_events     enable row level security;
alter table kb_path_stats enable row level security;

-- KB tables are server-only (service role in lib/kb/): no policies, and no
-- grants for the API roles (20261013182034_kb_server_only.sql).
revoke all on kb_nodes, kb_synonyms, kb_events, kb_path_stats from anon, authenticated;

-- ============================================================================
-- EPISODE DEFINITIONS (Turquoise Health Standard Service Packages)
-- Maps principal procedure codes to typical co-occurring billing codes based
-- on 2.7B Komodo Health claims. One row per SSP principal procedure.
-- ~2,948 rows (all SSPs), though pricing enrichment only activates for codes
-- that match search results.
-- ============================================================================
create table if not exists episode_definitions (
  id uuid primary key default gen_random_uuid(),
  ssp_code text unique not null,           -- Turquoise SSP identifier (= principal CPT/HCPCS)
  principal_code text not null,            -- Primary procedure code
  principal_code_type text not null default 'cpt', -- 'cpt' or 'hcpcs'
  label text not null,                     -- Human-readable name ("Knee Replacement")
  category text,                           -- Grouping: 'orthopedic', 'cardiac', etc.
  source text default 'turquoise_ssp',
  source_claim_count integer,              -- N claims underlying the SSP
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_episode_defs_principal on episode_definitions (principal_code);

alter table episode_definitions enable row level security;
create policy "Anyone can view episode definitions"
  on episode_definitions for select using (true);

-- ============================================================================
-- EPISODE COMPONENTS (codes that typically co-occur with a principal procedure)
-- Each row = one billing code observed in claims alongside the principal code.
-- Tier classification based on association (frequency ratio from claims data):
--   'required' >= 0.7, 'expected' 0.4-0.7, 'optional' 0.3-0.4
-- ~44K rows at association >= 0.3 threshold.
-- ============================================================================
create table if not exists episode_components (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episode_definitions(id) on delete cascade,
  code text not null,                      -- Component billing code
  code_type text not null,                 -- 'cpt', 'hcpcs', 'revenue_code'
  tier text not null,                      -- 'required', 'expected', 'optional'
  billing_class text,                      -- 'facility', 'professional'
  association float not null,              -- 0.0-1.0+ frequency ratio
  charge_weight float,                     -- % of total episode charge (future)
  total_count integer,                     -- Claim count from SSP data
  resolved_from text[],                    -- NCCI PTP merged codes
  constraint uq_episode_component unique (episode_id, code)
);

create index if not exists idx_episode_components_episode on episode_components (episode_id);
create index if not exists idx_episode_components_code on episode_components (code);

alter table episode_components enable row level security;
create policy "Anyone can view episode components"
  on episode_components for select using (true);

-- ============================================================================
-- RPC: lookup_episode_component_charges_v2()
-- Given a principal procedure code and a set of provider IDs, returns charge
-- data (with billing_class and the negotiated-rate range) for all episode
-- components at those providers, in one call. Used by the episode estimator.
-- ============================================================================
create or replace function lookup_episode_component_charges_v2(
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

-- ============================================================================
-- PROVIDER CASH RATIOS (materialized; refresh after import)
-- ============================================================================
-- Per-hospital cash ratios, used to convert an insured or gross price into a
-- cash-equivalent when a hospital publishes no cash price for an episode line.
--   ratio_type 'insured' = cash_price / avg_negotiated_rate
--   ratio_type 'gross'   = cash_price / gross_charge
-- computed over each hospital's charges that publish both prices.
-- Computing this live takes ~50s for 50 hospitals, so it is materialized and
-- refreshed after each import: select refresh_provider_cash_ratios();
create table if not exists provider_cash_ratios (
  provider_id uuid not null references providers(id) on delete cascade,
  ratio_type text not null check (ratio_type in ('insured', 'gross')),
  pair_count integer not null,
  q1 double precision not null,
  median double precision not null,
  q3 double precision not null,
  computed_at timestamptz not null default now(),
  primary key (provider_id, ratio_type)
);

alter table provider_cash_ratios enable row level security;
create policy "Anyone can view provider cash ratios"
  on provider_cash_ratios for select using (true);
revoke insert, update, delete, truncate, references, trigger
  on provider_cash_ratios from anon, authenticated;

-- Recompute ratios for the given hospitals, or all hospitals when null.
create or replace function refresh_provider_cash_ratios(
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

  -- A full refresh also refreshes the per-code typical prices below.
  if p_provider_ids is null then
    perform refresh_code_price_reference();
  end if;

  return affected;
end;
$$;

revoke execute on function refresh_provider_cash_ratios(uuid[])
  from public, anon, authenticated;
grant execute on function refresh_provider_cash_ratios(uuid[]) to service_role;

-- National typical price per billing code and fee type (#194). Prices more
-- than 10x off it are treated as missing (lib/cpt/price-bands.ts). Refreshed
-- by refresh_provider_cash_ratios() above.
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
