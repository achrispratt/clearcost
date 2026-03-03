/**
 * Follow-up geography fix for remaining issues after initial remediation:
 *
 *   1. 45 providers with ZIP↔state mismatch — the ZIP/coords are correct but
 *      `state` is wrong (bad Oria source data). Fix: set state from ZIP lookup.
 *
 *   2. 12 providers with placeholder ZIP "00000" — have valid lat/lng from
 *      Google Maps but no postal code. Fix: reverse-geocode lat/lng → ZIP.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-provider-geo-followup.ts [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { Pool as PgPool } from "pg";
// @ts-expect-error — zipcodes package has no type declarations
import zipcodes from "zipcodes";

const DRY_RUN = process.argv.includes("--dry-run");

interface Provider {
  id: string;
  name: string;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}

interface Fix {
  id: string;
  name: string;
  field: string;
  old_value: string | null;
  new_value: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reverseGeocode(
  lat: number,
  lng: number,
  apiKey: string
): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) return null;

  for (const result of data.results) {
    for (const component of result.address_components ?? []) {
      if (component.types?.includes("postal_code")) {
        return component.short_name;
      }
    }
  }

  return null;
}

async function main(): Promise<void> {
  console.log("=== Provider Geography Follow-up Fix ===\n");
  if (DRY_RUN) console.log("  *** DRY RUN MODE ***\n");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const dbUrl = process.env.SUPABASE_DB_URL!;
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!supabaseUrl || !supabaseKey || !dbUrl) {
    console.error("Missing required env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });
  await pgPool.query("SELECT 1");
  console.log("  Postgres connected\n");

  const fixes: Fix[] = [];

  // -----------------------------------------------------------------------
  // Fix 1: State mismatch — correct state from ZIP lookup
  // -----------------------------------------------------------------------
  console.log("=== Fix 1: Correct state from ZIP lookup ===\n");

  // Fetch all providers with a ZIP
  const allProviders: Provider[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, state, zip, lat, lng")
      .not("zip", "is", null)
      .range(offset, offset + 999);
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    allProviders.push(...(data as Provider[]));
    offset += 1000;
  }

  let stateFixes = 0;
  for (const p of allProviders) {
    if (!p.zip || p.zip === "00000") continue;
    const info = zipcodes.lookup(p.zip);
    if (!info) continue;

    const currentState = p.state?.trim().toUpperCase() ?? "";
    if (currentState !== info.state) {
      fixes.push({
        id: p.id,
        name: p.name,
        field: "state",
        old_value: p.state,
        new_value: info.state,
      });
      stateFixes++;
      console.log(`  ${p.name}: ${p.state} → ${info.state} (ZIP ${p.zip})`);
    }
  }
  console.log(`\n  Found ${stateFixes} state corrections\n`);

  // -----------------------------------------------------------------------
  // Fix 2: Placeholder ZIPs (00000) — reverse geocode from lat/lng
  // -----------------------------------------------------------------------
  console.log("=== Fix 2: Reverse geocode placeholder ZIPs ===\n");

  const { data: placeholderProviders, error: phErr } = await supabase
    .from("providers")
    .select("id, name, state, zip, lat, lng")
    .eq("zip", "00000");

  if (phErr) {
    console.error(`  Error fetching placeholder providers: ${phErr.message}`);
  }

  const placeholders = (placeholderProviders ?? []) as Provider[];
  console.log(`  Found ${placeholders.length} providers with ZIP=00000\n`);

  if (googleApiKey && placeholders.length > 0) {
    for (const p of placeholders) {
      if (p.lat == null || p.lng == null) {
        console.log(`  ${p.name}: no lat/lng, skipping`);
        continue;
      }

      await sleep(200);
      const realZip = await reverseGeocode(p.lat, p.lng, googleApiKey);

      if (realZip && realZip !== "00000") {
        // Also check if this ZIP gives us a better state
        const zipInfo = zipcodes.lookup(realZip);
        console.log(`  ${p.name}: 00000 → ${realZip} (${zipInfo?.city ?? "?"}, ${zipInfo?.state ?? "?"})`);

        fixes.push({
          id: p.id,
          name: p.name,
          field: "zip",
          old_value: "00000",
          new_value: realZip,
        });

        // If the state also needs correction based on the real ZIP
        if (zipInfo && p.state?.trim().toUpperCase() !== zipInfo.state) {
          fixes.push({
            id: p.id,
            name: p.name,
            field: "state",
            old_value: p.state,
            new_value: zipInfo.state,
          });
          console.log(`    also fixing state: ${p.state} → ${zipInfo.state}`);
        }
      } else {
        console.log(`  ${p.name}: reverse geocode returned no ZIP`);
      }
    }
  } else if (!googleApiKey) {
    console.log("  No Google Maps API key — skipping reverse geocode");
  }

  // -----------------------------------------------------------------------
  // Apply fixes
  // -----------------------------------------------------------------------
  console.log(`\n=== Applying ${fixes.length} fixes ===\n`);

  if (fixes.length === 0) {
    console.log("  Nothing to fix!");
    await pgPool.end();
    return;
  }

  // Group fixes by provider ID
  const fixesByProvider = new Map<string, { state?: string; zip?: string }>();
  for (const fix of fixes) {
    const existing = fixesByProvider.get(fix.id) ?? {};
    if (fix.field === "state") existing.state = fix.new_value;
    if (fix.field === "zip") existing.zip = fix.new_value;
    fixesByProvider.set(fix.id, existing);
  }

  if (DRY_RUN) {
    console.log("  DRY RUN — would update:");
    for (const [id, changes] of fixesByProvider) {
      const provider = fixes.find((f) => f.id === id);
      const parts = [];
      if (changes.state) parts.push(`state=${changes.state}`);
      if (changes.zip) parts.push(`zip=${changes.zip}`);
      console.log(`  ${provider?.name}: ${parts.join(", ")}`);
    }
    console.log("\n  Re-run without --dry-run to apply.");
    await pgPool.end();
    return;
  }

  // Apply: state-only updates
  const stateOnlyIds: { id: string; state: string }[] = [];
  const zipOnlyIds: { id: string; zip: string }[] = [];
  const bothIds: { id: string; state: string; zip: string }[] = [];

  for (const [id, changes] of fixesByProvider) {
    if (changes.state && changes.zip) {
      bothIds.push({ id, state: changes.state, zip: changes.zip });
    } else if (changes.state) {
      stateOnlyIds.push({ id, state: changes.state });
    } else if (changes.zip) {
      zipOnlyIds.push({ id, zip: changes.zip });
    }
  }

  let updated = 0;

  // Batch state-only updates
  if (stateOnlyIds.length > 0) {
    const values: unknown[] = [];
    const valueClauses: string[] = [];
    for (let i = 0; i < stateOnlyIds.length; i++) {
      valueClauses.push(`($${i * 2 + 1}::uuid, $${i * 2 + 2}::text)`);
      values.push(stateOnlyIds[i].id, stateOnlyIds[i].state);
    }
    const result = await pgPool.query(
      `UPDATE providers AS p SET state = v.state, updated_at = NOW()
       FROM (VALUES ${valueClauses.join(", ")}) AS v(id, state)
       WHERE p.id = v.id`,
      values
    );
    updated += result.rowCount ?? 0;
    console.log(`  Updated ${result.rowCount} provider states`);
  }

  // Batch zip-only updates
  if (zipOnlyIds.length > 0) {
    const values: unknown[] = [];
    const valueClauses: string[] = [];
    for (let i = 0; i < zipOnlyIds.length; i++) {
      valueClauses.push(`($${i * 2 + 1}::uuid, $${i * 2 + 2}::text)`);
      values.push(zipOnlyIds[i].id, zipOnlyIds[i].zip);
    }
    const result = await pgPool.query(
      `UPDATE providers AS p SET zip = v.zip, updated_at = NOW()
       FROM (VALUES ${valueClauses.join(", ")}) AS v(id, zip)
       WHERE p.id = v.id`,
      values
    );
    updated += result.rowCount ?? 0;
    console.log(`  Updated ${result.rowCount} provider ZIPs`);
  }

  // Batch both updates
  if (bothIds.length > 0) {
    const values: unknown[] = [];
    const valueClauses: string[] = [];
    for (let i = 0; i < bothIds.length; i++) {
      valueClauses.push(`($${i * 3 + 1}::uuid, $${i * 3 + 2}::text, $${i * 3 + 3}::text)`);
      values.push(bothIds[i].id, bothIds[i].state, bothIds[i].zip);
    }
    const result = await pgPool.query(
      `UPDATE providers AS p SET state = v.state, zip = v.zip, updated_at = NOW()
       FROM (VALUES ${valueClauses.join(", ")}) AS v(id, state, zip)
       WHERE p.id = v.id`,
      values
    );
    updated += result.rowCount ?? 0;
    console.log(`  Updated ${result.rowCount} provider state+ZIP combos`);
  }

  console.log(`\n  Total: ${updated} providers updated`);
  await pgPool.end();
}

main().catch((err) => {
  console.error("Follow-up fix failed:", err);
  process.exit(1);
});
