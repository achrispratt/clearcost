/**
 * Targeted migration: Move cross-column CPT/HCPCS search into Postgres.
 *
 * 1. Creates idx_charges_hcpcs_provider composite index
 * 2. Updates search_charges_nearby() RPC to check both cpt AND hcpcs columns
 *    when p_code_type = 'cpt'
 *
 * Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).
 * Connects directly to Postgres via the pg driver.
 *
 * Usage: npx tsx --env-file=.env.local scripts/migrate-cross-column-search.ts
 */

import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!DB_URL) {
  console.error("Missing SUPABASE_DB_URL");
  process.exit(1);
}

async function main() {
  console.log("Cross-Column Search Migration");
  console.log(`Target: ${DB_URL.replace(/:[^:@]+@/, ":***@")}\n`);

  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected to Postgres.\n");

  try {
    // Step 1: Create the composite index
    console.log("Step 1: Create idx_charges_hcpcs_provider index...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_charges_hcpcs_provider
        ON charges (hcpcs, provider_id);
    `);
    console.log("  Done.\n");

    // Step 2: Update the RPC function
    console.log(
      "Step 2: Update search_charges_nearby RPC (cross-column CPT/HCPCS)..."
    );
    await client.query(`
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
    `);
    console.log("  Done.\n");

    // Step 3: Verify — test a known CPT code query
    console.log("Step 3: Verify cross-column search...");
    const result = await client.query(`
      SELECT count(*) as total
      FROM charges c
      JOIN providers pr ON c.provider_id = pr.id
      WHERE pr.location IS NOT NULL
        AND st_dwithin(
          pr.location,
          st_setsrid(st_makepoint(-74.7116, 40.1462), 4326)::geography,
          200000
        )
        AND (c.cpt = '99385' OR c.hcpcs = '99385');
    `);
    console.log(
      `  Cross-column count for code 99385 near Bordentown NJ (200km): ${result.rows[0].total} rows`
    );

    // Also verify the RPC works via Supabase REST
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
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
        console.log(`  RPC via REST API: ${rows.length} results`);
      } else {
        console.error(`  RPC verification failed: ${verifyResp.status}`);
      }
    }

    // Verify index exists
    const idxResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'charges' AND indexname = 'idx_charges_hcpcs_provider';
    `);
    console.log(`  Index exists: ${idxResult.rows.length > 0 ? "yes" : "NO"}`);
  } finally {
    await client.end();
  }

  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
