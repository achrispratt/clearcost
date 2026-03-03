/**
 * Provider geography remediation script.
 *
 * Fixes 609 providers with geographic data problems:
 *   - 224 wrong ZIPs (extractZip grabbed street numbers instead of real ZIP codes)
 *   - 385 missing all geo data (no ZIP, no lat/lng)
 *
 * Three-tier geocoding cascade:
 *   1. extractZipV2 — find all 5-digit numbers, walk backwards, validate via zipcodes + state
 *   2. lookupByName — city+state → ZIP centroid (with abbreviation expansion)
 *   3. Google Maps Geocoding API — full address → precise lat/lng + postal_code
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-provider-geography.ts [--dry-run]
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

interface GeoFix {
  id: string;
  name: string;
  method: "extractZipV2" | "lookupByName" | "google_maps";
  old_zip: string | null;
  old_lat: number | null;
  old_lng: number | null;
  new_zip: string;
  new_lat: number;
  new_lng: number;
}

type IssueType = "wrong_zip" | "missing_geo";

interface TriagedProvider extends Provider {
  issue: IssueType;
  charge_count: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");
const GOOGLE_MAPS_DELAY_MS = 200;

// Common abbreviation expansions for lookupByName
const CITY_EXPANSIONS: [RegExp, string][] = [
  [/\bSt\.?\s/i, "Saint "],
  [/\bFt\.?\s/i, "Fort "],
  [/\bMt\.?\s/i, "Mount "],
  [/\bN\.?\s/i, "North "],
  [/\bS\.?\s/i, "South "],
  [/\bE\.?\s/i, "East "],
  [/\bW\.?\s/i, "West "],
];

// ---------------------------------------------------------------------------
// Geocoding: Tier 1 — extractZipV2
// ---------------------------------------------------------------------------

function extractZipV2(address: string, state: string | null): string | null {
  if (!address || !state) return null;
  const normalizedState = state.trim().toUpperCase();
  if (normalizedState.length !== 2) return null;

  // Find ALL 5-digit sequences (with optional +4 extension)
  const regex = /\b(\d{5})(?:-\d{4})?\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(address)) !== null) {
    candidates.push(match[1]);
  }

  // Walk backwards (ZIPs typically appear after city/state, street numbers come first)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    const info = zipcodes.lookup(candidate);
    if (info && info.state === normalizedState) {
      return candidate;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geocoding: Tier 2 — lookupByName with abbreviation expansion
// ---------------------------------------------------------------------------

function lookupByName(
  city: string | null,
  state: string | null
): { zip: string; lat: number; lng: number } | null {
  if (!city || !state) return null;
  const normalizedState = state.trim().toUpperCase();
  const normalizedCity = city.trim();

  // Try exact city name first
  const candidates = [normalizedCity];

  // Generate expanded variants (St. Louis → Saint Louis, etc.)
  for (const [pattern, replacement] of CITY_EXPANSIONS) {
    if (pattern.test(normalizedCity)) {
      candidates.push(normalizedCity.replace(pattern, replacement).trim());
    }
  }

  // Also try the reverse: if "Saint" is in the name, try "St"
  if (/\bSaint\s/i.test(normalizedCity)) {
    candidates.push(normalizedCity.replace(/\bSaint\s/i, "St ").trim());
  }
  if (/\bFort\s/i.test(normalizedCity)) {
    candidates.push(normalizedCity.replace(/\bFort\s/i, "Ft ").trim());
  }
  if (/\bMount\s/i.test(normalizedCity)) {
    candidates.push(normalizedCity.replace(/\bMount\s/i, "Mt ").trim());
  }

  for (const cityName of candidates) {
    const results = zipcodes.lookupByName(cityName, normalizedState);
    if (Array.isArray(results) && results.length > 0) {
      const first = results[0];
      if (first.zip && first.latitude != null && first.longitude != null) {
        return { zip: first.zip, lat: first.latitude, lng: first.longitude };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Geocoding: Tier 3 — Google Maps Geocoding API
// ---------------------------------------------------------------------------

async function geocodeWithGoogle(
  query: string,
  apiKey: string
): Promise<{ zip: string; lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) return null;

  const result = data.results[0];
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;

  if (lat == null || lng == null) return null;

  // Extract postal code from address components
  let zip: string | null = null;
  for (const component of result.address_components ?? []) {
    if (component.types?.includes("postal_code")) {
      zip = component.short_name;
      break;
    }
  }

  // If no postal code from Google, use a placeholder — coordinates are the real value
  if (!zip) zip = "00000";

  return { zip, lat, lng };
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
  stats: { extractZipV2: number; lookupByName: number; google_maps: number }
): Promise<GeoFix | null> {
  const base = {
    id: provider.id,
    name: provider.name,
    old_zip: provider.zip,
    old_lat: provider.lat,
    old_lng: provider.lng,
  };

  // Tier 1: extractZipV2
  const zip = extractZipV2(provider.address ?? "", provider.state);
  if (zip) {
    const info = zipcodes.lookup(zip);
    if (info) {
      stats.extractZipV2++;
      return {
        ...base,
        method: "extractZipV2",
        new_zip: zip,
        new_lat: info.latitude,
        new_lng: info.longitude,
      };
    }
  }

  // Tier 2: lookupByName (city+state → centroid)
  const byName = lookupByName(provider.city, provider.state);
  if (byName) {
    stats.lookupByName++;
    return {
      ...base,
      method: "lookupByName",
      new_zip: byName.zip,
      new_lat: byName.lat,
      new_lng: byName.lng,
    };
  }

  // Tier 3: Google Maps Geocoding API
  if (apiKey) {
    // Build a query from available data
    const parts: string[] = [];
    if (provider.address && provider.address.length > 5 && /[a-zA-Z]/.test(provider.address)) {
      parts.push(provider.address);
    }
    if (provider.city) parts.push(provider.city);
    if (provider.state) parts.push(provider.state);

    if (parts.length > 0) {
      const query = parts.join(", ");
      await sleep(GOOGLE_MAPS_DELAY_MS);
      const geoResult = await geocodeWithGoogle(query, apiKey);
      if (geoResult) {
        stats.google_maps++;
        return {
          ...base,
          method: "google_maps",
          new_zip: geoResult.zip,
          new_lat: geoResult.lat,
          new_lng: geoResult.lng,
        };
      }
    }

    // Last resort for providers with charges: try provider name as query
    if (provider.charge_count > 0 && provider.name) {
      const nameQuery = `${provider.name}, ${provider.state ?? ""}`.trim();
      await sleep(GOOGLE_MAPS_DELAY_MS);
      const geoResult = await geocodeWithGoogle(nameQuery, apiKey);
      if (geoResult) {
        stats.google_maps++;
        return {
          ...base,
          method: "google_maps",
          new_zip: geoResult.zip,
          new_lat: geoResult.lat,
          new_lng: geoResult.lng,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Phase 0: Triage
// ---------------------------------------------------------------------------

async function triage(
  supabaseUrl: string,
  supabaseKey: string,
  pgPool: PgPool
): Promise<TriagedProvider[]> {
  console.log("\n=== Phase 0: Triage ===\n");

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch all providers (paginated — Supabase caps at 1000 per request)
  const allProviders: Provider[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, address, city, state, zip, lat, lng")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error(`  Error fetching providers: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    allProviders.push(...(data as Provider[]));
    offset += pageSize;
  }

  console.log(`  Fetched ${allProviders.length.toLocaleString()} total providers`);

  // Identify affected providers
  const affected: TriagedProvider[] = [];

  for (const p of allProviders) {
    // Check for wrong ZIP: provider has a ZIP, but it belongs to a different state
    if (p.zip && p.state) {
      const info = zipcodes.lookup(p.zip);
      if (info && info.state !== p.state.trim().toUpperCase()) {
        affected.push({ ...p, issue: "wrong_zip", charge_count: 0 });
        continue;
      }
      // Also flag if ZIP doesn't resolve at all
      if (!info) {
        affected.push({ ...p, issue: "wrong_zip", charge_count: 0 });
        continue;
      }
    }

    // Check for missing geo: no ZIP and no coordinates
    if (!p.zip && (p.lat == null || p.lng == null)) {
      affected.push({ ...p, issue: "missing_geo", charge_count: 0 });
    }
  }

  // Batch-fetch charge counts for affected providers
  if (affected.length > 0) {
    const ids = affected.map((p) => p.id);
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

    for (const p of affected) {
      p.charge_count = countMap.get(p.id) ?? 0;
    }
  }

  // Print triage summary
  const wrongZip = affected.filter((p) => p.issue === "wrong_zip");
  const missingGeo = affected.filter((p) => p.issue === "missing_geo");
  const withCharges = affected.filter((p) => p.charge_count > 0);
  const totalChargesAtRisk = affected.reduce((sum, p) => sum + p.charge_count, 0);

  console.log(`\n  Triage Results:`);
  console.log(`    Wrong ZIP (state mismatch):  ${wrongZip.length}`);
  console.log(`    Missing all geo data:        ${missingGeo.length}`);
  console.log(`    Total affected:              ${affected.length}`);
  console.log(`    Providers with charges:      ${withCharges.length}`);
  console.log(`    Total charge rows at risk:   ${totalChargesAtRisk.toLocaleString()}`);

  return affected;
}

// ---------------------------------------------------------------------------
// Phase 1 & 2: Fix providers
// ---------------------------------------------------------------------------

async function fixProviders(
  affected: TriagedProvider[],
  apiKey: string | null
): Promise<{ fixes: GeoFix[]; unfixable: TriagedProvider[] }> {
  const wrongZip = affected.filter((p) => p.issue === "wrong_zip");
  const missingGeo = affected.filter((p) => p.issue === "missing_geo");

  console.log(`\n=== Phase 1: Fix wrong-ZIP providers (${wrongZip.length}) ===\n`);

  const stats = { extractZipV2: 0, lookupByName: 0, google_maps: 0 };
  const fixes: GeoFix[] = [];
  const unfixable: TriagedProvider[] = [];

  for (let i = 0; i < wrongZip.length; i++) {
    const p = wrongZip[i];
    const fix = await geocodeCascade(p, apiKey, stats);
    if (fix) {
      fixes.push(fix);
    } else {
      unfixable.push(p);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Processed ${i + 1}/${wrongZip.length} wrong-ZIP providers...`);
    }
  }

  console.log(`  Wrong-ZIP results: ${fixes.length} fixed, ${unfixable.length} unfixable`);
  console.log(`  Methods: extractZipV2=${stats.extractZipV2}, lookupByName=${stats.lookupByName}, google=${stats.google_maps}`);

  console.log(`\n=== Phase 2: Fix missing-geo providers (${missingGeo.length}) ===\n`);

  const stats2 = { extractZipV2: 0, lookupByName: 0, google_maps: 0 };

  // Categorize: parseable address vs garbage
  const parseable = missingGeo.filter((p) => {
    const addr = p.address?.trim() ?? "";
    return addr.length > 5 && /[a-zA-Z]/.test(addr);
  });
  const garbage = missingGeo.filter((p) => {
    const addr = p.address?.trim() ?? "";
    return addr.length <= 5 || !/[a-zA-Z]/.test(addr);
  });

  console.log(`  Parseable addresses: ${parseable.length}`);
  console.log(`  Garbage/empty addresses: ${garbage.length}`);

  // Process parseable addresses through full cascade
  for (let i = 0; i < parseable.length; i++) {
    const p = parseable[i];
    const fix = await geocodeCascade(p, apiKey, stats2);
    if (fix) {
      fixes.push(fix);
    } else {
      unfixable.push(p);
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Processed ${i + 1}/${parseable.length} parseable missing-geo providers...`);
    }
  }

  // Garbage addresses: try city+state lookup, then Google with provider name
  for (const p of garbage) {
    // Tier 2: city+state centroid
    const byName = lookupByName(p.city, p.state);
    if (byName) {
      stats2.lookupByName++;
      fixes.push({
        id: p.id,
        name: p.name,
        method: "lookupByName",
        old_zip: p.zip,
        old_lat: p.lat,
        old_lng: p.lng,
        new_zip: byName.zip,
        new_lat: byName.lat,
        new_lng: byName.lng,
      });
      continue;
    }

    // Tier 3: Google Maps with provider name (only if has charges)
    if (apiKey && p.charge_count > 0 && p.name && p.state) {
      const query = `${p.name}, ${p.state}`;
      await sleep(GOOGLE_MAPS_DELAY_MS);
      const geoResult = await geocodeWithGoogle(query, apiKey);
      if (geoResult) {
        stats2.google_maps++;
        fixes.push({
          id: p.id,
          name: p.name,
          method: "google_maps",
          old_zip: p.zip,
          old_lat: p.lat,
          old_lng: p.lng,
          new_zip: geoResult.zip,
          new_lat: geoResult.lat,
          new_lng: geoResult.lng,
        });
        continue;
      }
    }

    unfixable.push(p);
  }

  const missingFixed = fixes.length - wrongZip.length + unfixable.filter((u) => u.issue === "wrong_zip").length;
  console.log(`  Missing-geo fixed: ${missingFixed}`);
  console.log(`  Methods: extractZipV2=${stats2.extractZipV2}, lookupByName=${stats2.lookupByName}, google=${stats2.google_maps}`);

  return { fixes, unfixable };
}

// ---------------------------------------------------------------------------
// Phase 3: Apply fixes
// ---------------------------------------------------------------------------

async function applyFixes(
  fixes: GeoFix[],
  pgPool: PgPool
): Promise<void> {
  console.log(`\n=== Phase 3: Apply Fixes (${fixes.length} providers) ===\n`);

  if (DRY_RUN) {
    console.log("  *** DRY RUN — no changes will be applied ***\n");
  }

  // Print pre-update snapshot for rollback reference
  console.log("  Pre-update snapshot (id | old_zip | old_lat | old_lng -> new_zip | new_lat | new_lng | method):");
  console.log("  " + "-".repeat(120));
  for (const fix of fixes) {
    const oldLat = fix.old_lat != null ? fix.old_lat.toFixed(4) : "NULL";
    const oldLng = fix.old_lng != null ? fix.old_lng.toFixed(4) : "NULL";
    console.log(
      `  ${fix.id} | ${(fix.old_zip ?? "NULL").padEnd(7)} | ` +
      `${oldLat.padStart(9)} | ${oldLng.padStart(10)} -> ` +
      `${fix.new_zip.padEnd(7)} | ${fix.new_lat.toFixed(4).padStart(9)} | ${fix.new_lng.toFixed(4).padStart(10)} | ${fix.method}`
    );
  }
  console.log("  " + "-".repeat(120));

  if (DRY_RUN) {
    console.log("\n  DRY RUN complete. Re-run without --dry-run to apply changes.");
    return;
  }

  // Batch UPDATE in groups of 100
  const BATCH_SIZE = 100;
  let updated = 0;

  for (let i = 0; i < fixes.length; i += BATCH_SIZE) {
    const batch = fixes.slice(i, i + BATCH_SIZE);

    // Build VALUES clause for batch update
    const values: unknown[] = [];
    const valueClauses: string[] = [];
    for (let j = 0; j < batch.length; j++) {
      const fix = batch[j];
      const offset = j * 4;
      valueClauses.push(`($${offset + 1}::uuid, $${offset + 2}::text, $${offset + 3}::double precision, $${offset + 4}::double precision)`);
      values.push(fix.id, fix.new_zip, fix.new_lat, fix.new_lng);
    }

    const sql = `
      UPDATE providers AS p
      SET zip = v.zip, lat = v.lat, lng = v.lng, updated_at = NOW()
      FROM (VALUES ${valueClauses.join(", ")}) AS v(id, zip, lat, lng)
      WHERE p.id = v.id
    `;

    const result = await pgPool.query(sql, values);
    updated += result.rowCount ?? 0;

    if ((Math.floor(i / BATCH_SIZE) + 1) % 5 === 0) {
      console.log(`  Updated ${updated}/${fixes.length} providers...`);
    }
  }

  console.log(`\n  Applied ${updated} updates successfully.`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(
  fixes: GeoFix[],
  unfixable: TriagedProvider[],
  affected: TriagedProvider[]
): void {
  const byMethod = { extractZipV2: 0, lookupByName: 0, google_maps: 0 };
  for (const fix of fixes) byMethod[fix.method]++;

  const fixedIds = new Set(fixes.map((f) => f.id));
  const chargesRescued = affected
    .filter((p) => fixedIds.has(p.id))
    .reduce((sum, p) => sum + p.charge_count, 0);

  const chargesStillMissing = unfixable.reduce((sum, p) => sum + p.charge_count, 0);

  console.log("\n======================================================================");
  console.log("       Provider Geography Remediation Report                          ");
  console.log("======================================================================");
  console.log(`  Total affected:              ${affected.length}`);
  console.log(`  Fixed:                       ${fixes.length}`);
  console.log(`  Unfixable:                   ${unfixable.length}`);
  console.log("----------------------------------------------------------------------");
  console.log("  Fix Methods:");
  console.log(`    extractZipV2 (ZIP regex):  ${byMethod.extractZipV2}`);
  console.log(`    lookupByName (city/state): ${byMethod.lookupByName}`);
  console.log(`    Google Maps API:           ${byMethod.google_maps}`);
  console.log("----------------------------------------------------------------------");
  console.log(`  Charges rescued:             ${chargesRescued.toLocaleString()}`);
  console.log(`  Charges still invisible:     ${chargesStillMissing.toLocaleString()}`);
  console.log("======================================================================");

  if (unfixable.length > 0) {
    console.log("\n  Unfixable providers:");
    console.log("  " + "-".repeat(90));
    for (const p of unfixable.slice(0, 50)) {
      const charges = p.charge_count > 0 ? ` (${p.charge_count.toLocaleString()} charges)` : "";
      const addr = (p.address ?? "NULL").slice(0, 50);
      console.log(`  ${p.issue.padEnd(12)} | ${p.state ?? "??"} | ${addr.padEnd(52)} | ${p.name.slice(0, 40)}${charges}`);
    }
    if (unfixable.length > 50) {
      console.log(`  ... and ${unfixable.length - 50} more`);
    }
    console.log("  " + "-".repeat(90));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("=== ClearCost Provider Geography Remediation ===\n");
  if (DRY_RUN) console.log("  *** DRY RUN MODE — no database changes ***\n");

  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL");
    process.exit(1);
  }

  if (googleApiKey) {
    console.log("  Google Maps API key: found (Tier 3 geocoding enabled)");
  } else {
    console.log("  Google Maps API key: NOT found (Tier 3 disabled — Tiers 1 & 2 only)");
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
    // Phase 0: Triage
    const affected = await triage(supabaseUrl, supabaseKey, pgPool);

    if (affected.length === 0) {
      console.log("\n  No providers need fixing. All clean!");
      return;
    }

    // Phase 1 & 2: Fix
    const { fixes, unfixable } = await fixProviders(affected, googleApiKey);

    // Phase 3: Apply
    if (fixes.length > 0) {
      await applyFixes(fixes, pgPool);
    } else {
      console.log("\n  No fixes to apply.");
    }

    // Report
    printReport(fixes, unfixable, affected);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\nCompleted in ${elapsed}s`);
  } finally {
    await pgPool.end();
  }
}

main().catch((err) => {
  console.error("Remediation failed:", err);
  process.exit(1);
});
