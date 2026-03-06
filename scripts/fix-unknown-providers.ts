/**
 * Fix providers missing geography (#61).
 *
 * Targets all providers with lat IS NULL (271 total):
 *   - 118 with state='UNKNOWN' — Oria had hospital_state=null, pipeline couldn't geocode
 *   - 153 with a state value but still missing zip/lat/lng (some states are wrong too)
 *
 * Two-tier geocoding cascade (no state required as input):
 *   1. extractZipStateless — parse 5-digit ZIPs from address, validate via zipcodes,
 *      derive state FROM the ZIP
 *   2. Google Maps Geocoding API — extract lat/lng + postal_code + state
 *
 * State handling:
 *   - 'UNKNOWN' states are always replaced with the geocoded state
 *   - Other states are corrected if geocoding reveals a mismatch (e.g., AR → OK)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-unknown-providers.ts [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { Pool as PgPool } from "pg";
// @ts-expect-error — zipcodes package has no type declarations
import zipcodes from "zipcodes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Provider {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}

interface TriagedProvider extends Provider {
  charge_count: number;
}

interface GeoFix {
  id: string;
  name: string;
  method: "extractZipStateless" | "google_maps";
  old_state: string | null;
  new_state: string;
  new_zip: string;
  new_lat: number;
  new_lng: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");
const GOOGLE_MAPS_DELAY_MS = 200;

// Valid US state/territory codes — reject anything else from Google Maps
const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
  "PR",
  "VI",
  "GU",
  "AS",
  "MP",
]);

// ---------------------------------------------------------------------------
// Geocoding: Tier 1 — extractZipStateless
// ---------------------------------------------------------------------------

function extractZipStateless(
  address: string
): { zip: string; state: string; lat: number; lng: number } | null {
  if (!address) return null;

  // Handle pipe-separated addresses — take first segment
  const cleaned = address.includes("|")
    ? address.split("|")[0].trim()
    : address;

  // Skip addresses that are clearly not real (e.g., "[]", just a name)
  if (cleaned.length < 5 || !/\d{5}/.test(cleaned)) return null;

  // Find ALL 5-digit sequences (with optional +4 extension)
  const regex = /\b(\d{5})(?:-\d{4})?\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    candidates.push(match[1]);
  }

  // Walk backwards — ZIPs appear at the end of addresses, street numbers at the start
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    const info = zipcodes.lookup(candidate);
    if (info && info.latitude != null && info.longitude != null) {
      return {
        zip: candidate,
        state: info.state,
        lat: info.latitude,
        lng: info.longitude,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geocoding: Tier 2 — Google Maps Geocoding API (extracts state too)
// ---------------------------------------------------------------------------

async function geocodeWithGoogle(
  query: string,
  apiKey: string
): Promise<{
  zip: string;
  state: string;
  lat: number;
  lng: number;
} | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=us&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) return null;

  const result = data.results[0];
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;

  if (lat == null || lng == null) return null;

  // Extract postal code and state from address components
  let zip: string | null = null;
  let state: string | null = null;

  for (const component of result.address_components ?? []) {
    if (component.types?.includes("postal_code")) {
      zip = component.short_name;
    }
    if (component.types?.includes("administrative_area_level_1")) {
      state = component.short_name;
    }
  }

  if (!zip) zip = "00000";
  if (!state) return null; // State is required — can't fix without it
  if (!US_STATES.has(state)) return null; // Reject non-US results

  return { zip, state, lat, lng };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Geocoding cascade
// ---------------------------------------------------------------------------

async function geocodeCascade(
  provider: TriagedProvider,
  apiKey: string | null,
  stats: { extractZipStateless: number; google_maps: number }
): Promise<GeoFix | null> {
  const base = {
    id: provider.id,
    name: provider.name,
    old_state: provider.state,
  };
  const needsState =
    !provider.state ||
    provider.state === "UNKNOWN" ||
    !US_STATES.has(provider.state);

  // Tier 1: extractZipStateless — parse ZIP from address
  // High confidence: ZIP is literally in the address text, so trust its state
  const addr = provider.address?.trim() ?? "";
  if (addr.length > 0 && addr !== "[]") {
    const parsed = extractZipStateless(addr);
    if (parsed) {
      stats.extractZipStateless++;
      return {
        ...base,
        method: "extractZipStateless",
        // ZIP-derived state always wins — it's the most reliable signal
        new_state: parsed.state,
        new_zip: parsed.zip,
        new_lat: parsed.lat,
        new_lng: parsed.lng,
      };
    }
  }

  // Tier 2: Google Maps
  if (!apiKey) return null;

  // Include existing valid state in queries for better Google accuracy
  const existingState =
    provider.state &&
    US_STATES.has(provider.state) &&
    provider.state !== "UNKNOWN"
      ? provider.state
      : null;

  // Build query from available fields
  const parts: string[] = [];
  if (addr.length > 5 && addr !== "[]" && /[a-zA-Z]/.test(addr)) {
    // Handle pipe-separated addresses
    const cleanAddr = addr.includes("|") ? addr.split("|")[0].trim() : addr;
    parts.push(cleanAddr);
  }
  if (provider.city) parts.push(provider.city);
  if (existingState && parts.length > 0) parts.push(existingState);

  if (parts.length > 0) {
    const query = parts.join(", ");
    await sleep(GOOGLE_MAPS_DELAY_MS);
    const geoResult = await geocodeWithGoogle(query, apiKey);
    if (geoResult) {
      stats.google_maps++;
      return {
        ...base,
        method: "google_maps",
        // Google Maps: only replace state if current is UNKNOWN/invalid
        new_state: needsState ? geoResult.state : provider.state!,
        new_zip: geoResult.zip,
        new_lat: geoResult.lat,
        new_lng: geoResult.lng,
      };
    }
  }

  // Fallback: try provider name (+ state if available)
  if (provider.name) {
    const nameParts = [provider.name];
    if (provider.city) nameParts.push(provider.city);
    if (existingState) nameParts.push(existingState);
    const nameQuery = nameParts.join(", ");
    await sleep(GOOGLE_MAPS_DELAY_MS);
    const geoResult = await geocodeWithGoogle(nameQuery, apiKey);
    if (geoResult) {
      stats.google_maps++;
      return {
        ...base,
        method: "google_maps",
        new_state: needsState ? geoResult.state : provider.state!,
        new_zip: geoResult.zip,
        new_lat: geoResult.lat,
        new_lng: geoResult.lng,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Phase 1: Triage
// ---------------------------------------------------------------------------

async function triage(
  supabaseUrl: string,
  supabaseKey: string,
  pgPool: PgPool
): Promise<TriagedProvider[]> {
  console.log("\n=== Phase 1: Triage ===\n");

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch providers with lat IS NULL (missing geography)
  const { data, error } = await supabase
    .from("providers")
    .select("id, name, address, city, state, zip, lat, lng")
    .is("lat", null);

  if (error) {
    console.error(`  Error fetching providers: ${error.message}`);
    process.exit(1);
  }

  const providers = (data ?? []) as Provider[];
  const unknownState = providers.filter((p) => p.state === "UNKNOWN");
  const hasState = providers.filter((p) => p.state && p.state !== "UNKNOWN");
  console.log(`  Found ${providers.length} providers with lat IS NULL`);
  console.log(`    state='UNKNOWN': ${unknownState.length}`);
  console.log(`    has state but no geo: ${hasState.length}`);

  if (providers.length === 0) return [];

  // Fetch charge counts
  const ids = providers.map((p) => p.id);
  const chargeCountRes = await pgPool.query(
    `SELECT provider_id, COUNT(*)::int AS charge_count
     FROM charges WHERE provider_id = ANY($1)
     GROUP BY provider_id`,
    [ids]
  );

  const countMap = new Map<string, number>();
  for (const row of chargeCountRes.rows) {
    countMap.set(row.provider_id, row.charge_count);
  }

  const triaged: TriagedProvider[] = providers.map((p) => ({
    ...p,
    charge_count: countMap.get(p.id) ?? 0,
  }));

  const withCharges = triaged.filter((p) => p.charge_count > 0);
  const totalCharges = triaged.reduce((s, p) => s + p.charge_count, 0);

  console.log(`  Providers with charges:    ${withCharges.length}`);
  console.log(`  Total charges at risk:     ${totalCharges.toLocaleString()}`);

  return triaged;
}

// ---------------------------------------------------------------------------
// Phase 2: Fix
// ---------------------------------------------------------------------------

async function fixProviders(
  providers: TriagedProvider[],
  apiKey: string | null
): Promise<{ fixes: GeoFix[]; unfixable: TriagedProvider[] }> {
  console.log(`\n=== Phase 2: Fix (${providers.length} providers) ===\n`);

  const stats = { extractZipStateless: 0, google_maps: 0 };
  const fixes: GeoFix[] = [];
  const unfixable: TriagedProvider[] = [];

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const fix = await geocodeCascade(p, apiKey, stats);
    if (fix) {
      fixes.push(fix);
    } else {
      unfixable.push(p);
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  Processed ${i + 1}/${providers.length}...`);
    }
  }

  console.log(
    `\n  Results: ${fixes.length} fixed, ${unfixable.length} unfixable`
  );
  console.log(
    `  Methods: extractZipStateless=${stats.extractZipStateless}, google_maps=${stats.google_maps}`
  );

  return { fixes, unfixable };
}

// ---------------------------------------------------------------------------
// Phase 3: Apply
// ---------------------------------------------------------------------------

async function applyFixes(fixes: GeoFix[], pgPool: PgPool): Promise<void> {
  console.log(`\n=== Phase 3: Apply (${fixes.length} providers) ===\n`);

  if (DRY_RUN) {
    console.log("  *** DRY RUN — no changes will be applied ***\n");
  }

  // Print snapshot
  console.log(
    "  old_state → new_state | new_zip | new_lat | new_lng | method | name"
  );
  console.log("  " + "-".repeat(110));
  for (const fix of fixes) {
    const oldSt = (fix.old_state ?? "NULL").padEnd(7);
    const stateChanged = fix.old_state !== fix.new_state;
    const arrow = stateChanged ? "→" : "=";
    console.log(
      `  ${oldSt} ${arrow} ${fix.new_state.padEnd(7)} | ${fix.new_zip.padEnd(7)} | ` +
        `${fix.new_lat.toFixed(4).padStart(9)} | ${fix.new_lng.toFixed(4).padStart(10)} | ` +
        `${fix.method.padEnd(20)} | ${fix.name.slice(0, 40)}`
    );
  }
  console.log("  " + "-".repeat(110));

  if (DRY_RUN) {
    console.log(
      "\n  DRY RUN complete. Re-run without --dry-run to apply changes."
    );
    return;
  }

  // Batch UPDATE in groups of 50
  const BATCH_SIZE = 50;
  let updated = 0;

  for (let i = 0; i < fixes.length; i += BATCH_SIZE) {
    const batch = fixes.slice(i, i + BATCH_SIZE);

    const values: unknown[] = [];
    const valueClauses: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const fix = batch[j];
      const offset = j * 5;
      valueClauses.push(
        `($${offset + 1}::uuid, $${offset + 2}::text, $${offset + 3}::text, $${offset + 4}::double precision, $${offset + 5}::double precision)`
      );
      values.push(fix.id, fix.new_state, fix.new_zip, fix.new_lat, fix.new_lng);
    }

    const sql = `
      UPDATE providers AS p
      SET state = v.state, zip = v.zip, lat = v.lat, lng = v.lng, updated_at = NOW()
      FROM (VALUES ${valueClauses.join(", ")}) AS v(id, state, zip, lat, lng)
      WHERE p.id = v.id
    `;

    const result = await pgPool.query(sql, values);
    updated += result.rowCount ?? 0;
  }

  console.log(`\n  Applied ${updated} updates successfully.`);
}

// ---------------------------------------------------------------------------
// Phase 4: Report
// ---------------------------------------------------------------------------

function printReport(
  fixes: GeoFix[],
  unfixable: TriagedProvider[],
  all: TriagedProvider[]
): void {
  const byMethod = { extractZipStateless: 0, google_maps: 0 };
  for (const fix of fixes) byMethod[fix.method]++;

  const fixedIds = new Set(fixes.map((f) => f.id));
  const chargesRescued = all
    .filter((p) => fixedIds.has(p.id))
    .reduce((s, p) => s + p.charge_count, 0);

  const chargesStillMissing = unfixable.reduce((s, p) => s + p.charge_count, 0);

  // State breakdown
  const stateMap = new Map<string, number>();
  let stateCorrections = 0;
  let unknownResolved = 0;
  for (const fix of fixes) {
    stateMap.set(fix.new_state, (stateMap.get(fix.new_state) ?? 0) + 1);
    if (fix.old_state === "UNKNOWN") unknownResolved++;
    else if (fix.old_state !== fix.new_state) stateCorrections++;
  }
  const stateBreakdown = [...stateMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([st, n]) => `${st}(${n})`)
    .join(", ");

  console.log(
    "\n======================================================================"
  );
  console.log(
    "       Missing Geography Provider Fix Report (#61)                    "
  );
  console.log(
    "======================================================================"
  );
  console.log(`  Total affected:              ${all.length}`);
  console.log(`  Fixed:                       ${fixes.length}`);
  console.log(`  Unfixable:                   ${unfixable.length}`);
  console.log(
    "----------------------------------------------------------------------"
  );
  console.log("  Fix Methods:");
  console.log(`    extractZipStateless:       ${byMethod.extractZipStateless}`);
  console.log(`    Google Maps API:           ${byMethod.google_maps}`);
  console.log(
    "----------------------------------------------------------------------"
  );
  console.log(
    `  Charges rescued:             ${chargesRescued.toLocaleString()}`
  );
  console.log(
    `  Charges still invisible:     ${chargesStillMissing.toLocaleString()}`
  );
  console.log(
    "----------------------------------------------------------------------"
  );
  console.log(`  UNKNOWN → resolved:          ${unknownResolved}`);
  console.log(`  State corrections:           ${stateCorrections}`);
  console.log(`  States resolved:             ${stateBreakdown}`);
  console.log(
    "======================================================================"
  );

  if (unfixable.length > 0) {
    console.log("\n  Unfixable providers:");
    console.log("  " + "-".repeat(90));
    for (const p of unfixable) {
      const charges =
        p.charge_count > 0
          ? ` (${p.charge_count.toLocaleString()} charges)`
          : "";
      const addr = (p.address ?? "NULL").slice(0, 50);
      console.log(`  ${addr.padEnd(52)} | ${p.name.slice(0, 40)}${charges}`);
    }
    console.log("  " + "-".repeat(90));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("=== ClearCost: Fix UNKNOWN-State Providers (#61) ===\n");
  if (DRY_RUN) console.log("  *** DRY RUN MODE — no database changes ***\n");

  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL");
    process.exit(1);
  }

  if (googleApiKey) {
    console.log("  Google Maps API key: found (Tier 2 geocoding enabled)");
  } else {
    console.log(
      "  Google Maps API key: NOT found (Tier 2 disabled — Tier 1 only)"
    );
  }

  // Connect to Postgres via pooler (port 6543)
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });
  await pgPool.query("SELECT 1");
  console.log("  Postgres connected via pooler");

  try {
    // Phase 1: Triage
    const affected = await triage(supabaseUrl, supabaseKey, pgPool);

    if (affected.length === 0) {
      console.log("\n  No providers with missing geography. All clean!");
      return;
    }

    // Phase 2: Fix
    const { fixes, unfixable } = await fixProviders(affected, googleApiKey);

    // Phase 3: Apply
    if (fixes.length > 0) {
      await applyFixes(fixes, pgPool);
    } else {
      console.log("\n  No fixes to apply.");
    }

    // Phase 4: Report
    printReport(fixes, unfixable, affected);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s`);
  } finally {
    await pgPool.end();
  }
}

main().catch((err) => {
  console.error("Fix failed:", err);
  process.exit(1);
});
