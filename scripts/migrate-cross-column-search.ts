/**
 * Targeted migration: Move cross-column CPT/HCPCS search into Postgres.
 *
 * 1. Creates idx_charges_hcpcs_provider composite index
 * 2. Updates search_charges_nearby() RPC to check both cpt AND hcpcs columns
 *    when p_code_type = 'cpt'
 *
 * Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-cross-column-search.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function runSQL(sql: string, label: string): Promise<boolean> {
  console.log(`\n${label}...`);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ sql_text: sql }),
  });

  if (response.ok) {
    console.log(`  Done (via RPC)`);
    return true;
  }

  // Fallback to /pg/query endpoint
  const response2 = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (response2.ok) {
    console.log(`  Done (via pg/query)`);
    return true;
  }

  const errText1 = await response.text();
  const errText2 = await response2.text();
  console.error(`  FAILED`);
  console.error(`  /rpc/exec_sql: ${response.status} ${errText1.substring(0, 300)}`);
  console.error(`  /pg/query: ${response2.status} ${errText2.substring(0, 300)}`);
  return false;
}

async function main() {
  console.log("Cross-Column Search Migration");
  console.log(`Target: ${SUPABASE_URL}\n`);

  // Step 1: Create the composite index
  // Note: CONCURRENTLY can't run inside a transaction, but through the REST API
  // each statement is its own transaction, so this is fine.
  const indexOk = await runSQL(
    `CREATE INDEX IF NOT EXISTS idx_charges_hcpcs_provider ON charges (hcpcs, provider_id);`,
    "Step 1: Create idx_charges_hcpcs_provider index"
  );

  if (!indexOk) {
    console.error("\nIndex creation failed. Aborting.");
    process.exit(1);
  }

  // Step 2: Update the RPC function
  const rpcSQL = `
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
`;

  const rpcOk = await runSQL(rpcSQL, "Step 2: Update search_charges_nearby RPC (cross-column CPT/HCPCS)");

  if (!rpcOk) {
    console.error("\nRPC update failed.");
    process.exit(1);
  }

  // Step 3: Quick verification — count charges matching a known CPT code via both columns
  console.log("\nStep 3: Verify...");
  const verifyResp = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/search_charges_nearby`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_code_type: "cpt",
        p_codes: ["99385"],
        p_lat: 40.1462,
        p_lng: -74.7116,
        p_radius_km: 200,
      }),
    }
  );

  if (verifyResp.ok) {
    const rows = await verifyResp.json();
    console.log(`  search_charges_nearby('cpt', ['99385'], Bordentown NJ, 200km) → ${rows.length} results`);
    if (rows.length > 0) {
      console.log(`  First result: ${rows[0].provider_name} — $${rows[0].cash_price || "N/A"}`);
    }
  } else {
    console.error(`  Verification query failed: ${verifyResp.status}`);
  }

  console.log("\nMigration complete.");
}

main().catch(console.error);
