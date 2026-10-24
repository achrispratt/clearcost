/**
 * Data pipeline for importing Trilliant Health Oria data into Supabase.
 *
 * Imports ~13M rows across 1,050 CPT/HCPCS codes from 4,230 hospitals nationally.
 * Codes sourced from: CMS 70 shoppable + CMS top 200 by charges + top 500 by
 * hospital coverage + FAIR Health 300+ consumer shoppable services.
 *
 * Prerequisites:
 *   1. Download the Oria DuckDB + Parquet archive from https://oria-data.trillianthealth.com/docs
 *   2. Extract to lib/data/ (should produce mrf_lake/ directory with mrf_lake.duckdb + parquet/)
 *   3. Ensure final-codes.json exists in lib/data/ (1,010 curated codes)
 *
 * Run with:
 *   npx tsx --env-file=.env.local lib/data/import-trilliant.ts
 *
 * Options:
 *   --db-path <path>      Path to Oria DuckDB file (default: lib/data/mrf_lake/mrf_lake.duckdb)
 *   --skip-providers       Skip provider import
 *   --skip-charges         Skip charges import
 *   --batch-size <n>       Postgres insert batch size (default: 500)
 *   --limit <n>            Limit total charges imported (for testing, e.g. --limit 10000)
 *   --state <ST>           Only import charges from a specific state (e.g. --state NY)
 *   --skip-states <ST,ST>  Skip these states (already imported). Preserves existing data.
 *                          (e.g. --skip-states AK,AL,AR,AZ,CA,CO,CT,DC,DE,FL)
 *   --fresh                TRUNCATE charges + drop/recreate indexes for clean reimport
 *   --codes <file.json>    Targeted import: only import charges for codes in this file.
 *                          Uses scoped DELETE (only target codes per state, not all charges).
 *                          Tracks progress under a separate run key (derived from filename).
 *                          Auto-skips provider import. Idempotent — safe to re-run.
 *                          Use for code list expansion or targeted price refreshes.
 *
 * Every charge carries source_charge_id = Oria standard_charges.charge_id and is
 * written with INSERT ... ON CONFLICT (provider_id, source_charge_id) DO UPDATE
 * (charge_id is only unique within a hospital), so retries and re-runs never
 * duplicate a source row; they refresh it in place (#59).
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "duckdb-async";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { Pool as PgPool } from "pg";
import { parseLaterality } from "../cpt/parse-laterality";
import { parseBodySite } from "../cpt/parse-body-site";
import { normalizeBillingClass, normalizeSetting } from "./normalize-charge";
import { buildChargeSelect } from "./charge-select";
import { withoutCrawledRows } from "./crawler-overlap";
import {
  assertChargeIdsUnique,
  CHARGE_LINEAGE_CONFLICT,
} from "./charge-id-guard";

// @ts-expect-error — zipcodes package has no type declarations
import zipcodes from "zipcodes";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DB_PATH = resolve(__dirname, "mrf_lake", "mrf_lake.duckdb");
const DEFAULT_BATCH_SIZE = 500;
const PROGRESS_FILE_PATH = resolve(__dirname, "import-progress.json");

interface StateProgress {
  rows: number;
  expected: number;
  skipped: number;
  completedAt: string;
}

interface ProgressData {
  [runKey: string]: Record<string, StateProgress>;
}

// Column order for multi-row INSERT INTO charges
const CHARGE_COLUMNS = [
  "provider_id",
  "description",
  "setting",
  "billing_class",
  "cpt",
  "hcpcs",
  "ms_drg",
  "revenue_code",
  "ndc",
  "icd",
  "modifiers",
  "laterality",
  "body_site",
  "gross_charge",
  "cash_price",
  "min_price",
  "max_price",
  "avg_negotiated_rate",
  "min_negotiated_rate",
  "max_negotiated_rate",
  "payer_count",
  "source",
  "imported_at",
  "source_charge_id",
] as const;

// Columns refreshed when a row with the same (provider_id, source_charge_id)
// already exists (everything except the conflict key; created_at keeps its
// first value).
const CHARGE_UPDATE_COLUMNS = CHARGE_COLUMNS.filter(
  (c) => c !== "provider_id" && c !== "source_charge_id"
);

// Index definitions — must match supabase/schema.sql exactly.
// idx_charges_provider_source_charge_id is deliberately NOT listed: --fresh
// must never drop it, because every batch upserts with
// ON CONFLICT (provider_id, source_charge_id).
const CHARGE_INDEXES = [
  {
    name: "idx_charges_cpt",
    sql: "CREATE INDEX idx_charges_cpt ON charges (cpt)",
  },
  {
    name: "idx_charges_hcpcs",
    sql: "CREATE INDEX idx_charges_hcpcs ON charges (hcpcs)",
  },
  {
    name: "idx_charges_ms_drg",
    sql: "CREATE INDEX idx_charges_ms_drg ON charges (ms_drg)",
  },
  {
    name: "idx_charges_provider",
    sql: "CREATE INDEX idx_charges_provider ON charges (provider_id)",
  },
  {
    name: "idx_charges_cpt_provider",
    sql: "CREATE INDEX idx_charges_cpt_provider ON charges (cpt, provider_id)",
  },
  {
    name: "idx_charges_hcpcs_provider",
    sql: "CREATE INDEX idx_charges_hcpcs_provider ON charges (hcpcs, provider_id)",
  },
  {
    name: "idx_charges_description",
    sql: "CREATE INDEX idx_charges_description ON charges USING gin (to_tsvector('english', coalesce(description, '')))",
  },
  {
    name: "idx_charges_laterality",
    sql: "CREATE INDEX idx_charges_laterality ON charges (laterality) WHERE laterality IS NOT NULL",
  },
];

// ---------------------------------------------------------------------------
// Types — actual Oria schema
// ---------------------------------------------------------------------------

interface OraHospital {
  hospital_id: number;
  hospital_name: string;
  hospital_address: string | null;
  hospital_location: string | null;
  hospital_city: string | null;
  hospital_state: string | null;
  last_updated_on: string | null;
  status: string | null;
}

interface OraStandardCharge {
  charge_id: number | bigint; // DuckDB BIGINT → JS BigInt
  hospital_id: number;
  description: string | null;
  gross_charge: number | null;
  discounted_cash: number | null;
  minimum: number | null;
  maximum: number | null;
  setting: string | null;
  billing_class: string | null;
  modifiers: string | null;
  // Pre-split billing codes
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  rc: string | null;
  ndc: string | null;
  icd: string | null;
  // Pre-computed aggregates
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
  max_negotiated_rate: number | null;
  payer_count: number | null;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dbPath: DEFAULT_DB_PATH,
    skipProviders: false,
    skipCharges: false,
    batchSize: DEFAULT_BATCH_SIZE,
    limit: 0, // 0 = no limit
    state: "", // empty = all states
    skipStates: [] as string[], // states to skip (already imported)
    fresh: false, // TRUNCATE + drop/recreate indexes for clean reimport
    codesFile: "", // path to JSON with specific codes for targeted import
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--db-path":
        config.dbPath = resolve(args[++i]);
        break;
      case "--skip-providers":
        config.skipProviders = true;
        break;
      case "--skip-charges":
        config.skipCharges = true;
        break;
      case "--batch-size":
        config.batchSize = parseInt(args[++i], 10);
        break;
      case "--limit":
        config.limit = parseInt(args[++i], 10);
        break;
      case "--state":
        config.state = args[++i].toUpperCase();
        break;
      case "--skip-states":
        config.skipStates = args[++i].toUpperCase().split(",").filter(Boolean);
        break;
      case "--fresh":
        config.fresh = true;
        break;
      case "--codes":
        config.codesFile = resolve(args[++i]);
        break;
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Zip-based geocoding
// ---------------------------------------------------------------------------

/** Trim whitespace, collapse "null" strings and empty strings to SQL NULL. */
function nullify(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed.toLowerCase() === "null" ? null : trimmed;
}

function extractZip(address: string, state?: string | null): string | null {
  if (!state) return null;
  const normalizedState = state.trim().toUpperCase();
  if (normalizedState.length !== 2) return null;

  // Find ALL 5-digit sequences (with optional +4 extension)
  const regex = /\b(\d{5})(?:-\d{4})?\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(address)) !== null) {
    candidates.push(match[1]);
  }

  // Walk backwards — ZIPs appear after city/state, street numbers come first.
  // Validate each candidate against the zipcodes library + provider's state.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    const info = zipcodes.lookup(candidate);
    if (info && info.state === normalizedState) {
      return candidate;
    }
  }

  return null;
}

// Common city abbreviation expansions for lookupByName fallback
const CITY_EXPANSIONS: [RegExp, string][] = [
  [/\bSt\.?\s/i, "Saint "],
  [/\bFt\.?\s/i, "Fort "],
  [/\bMt\.?\s/i, "Mount "],
];

function geocodeByZip(
  address: string | null,
  state?: string | null,
  city?: string | null
): { lat: number; lng: number; zip: string } | null {
  // Tier 1: extract validated ZIP from address
  if (address) {
    const zip = extractZip(address, state);
    if (zip) {
      const result = zipcodes.lookup(zip);
      if (result) return { lat: result.latitude, lng: result.longitude, zip };
    }
  }

  // Tier 2: city+state → ZIP centroid via lookupByName
  if (city && state) {
    const normalizedState = state.trim().toUpperCase();
    const normalizedCity = city.trim();
    const candidates = [normalizedCity];

    for (const [pattern, replacement] of CITY_EXPANSIONS) {
      if (pattern.test(normalizedCity)) {
        candidates.push(normalizedCity.replace(pattern, replacement).trim());
      }
    }

    for (const cityName of candidates) {
      const results = zipcodes.lookupByName(cityName, normalizedState);
      if (Array.isArray(results) && results.length > 0) {
        const first = results[0];
        if (first.zip && first.latitude != null && first.longitude != null) {
          return { lat: first.latitude, lng: first.longitude, zip: first.zip };
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Import progress tracking
// ---------------------------------------------------------------------------

function loadProgress(): ProgressData {
  try {
    if (existsSync(PROGRESS_FILE_PATH)) {
      const raw = readFileSync(PROGRESS_FILE_PATH, "utf8");
      return JSON.parse(raw) as ProgressData;
    }
  } catch (err) {
    console.warn(
      `  Warning: could not read progress file: ${err instanceof Error ? err.message : err}`
    );
  }
  return {};
}

function saveStateProgress(
  progressKey: string,
  state: string,
  rows: number,
  expected: number = 0,
  skipped: number = 0
): void {
  const progress = loadProgress();
  if (!progress[progressKey]) progress[progressKey] = {};
  progress[progressKey][state] = {
    rows,
    expected,
    skipped,
    completedAt: new Date().toISOString(),
  };
  writeFileSync(PROGRESS_FILE_PATH, JSON.stringify(progress, null, 2), "utf8");
}

function deleteProgressFile(): void {
  if (existsSync(PROGRESS_FILE_PATH)) {
    unlinkSync(PROGRESS_FILE_PATH);
    console.log("  Deleted progress file");
  }
}

// ---------------------------------------------------------------------------
// Supabase batch insert helper
// ---------------------------------------------------------------------------

async function batchInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  batchSize: number,
  label: string
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);

    if (error) {
      console.error(
        `  Error inserting ${label} batch ${Math.floor(i / batchSize) + 1}: ${error.message}`
      );
      continue;
    }

    inserted += batch.length;

    if ((Math.floor(i / batchSize) + 1) % 10 === 0) {
      console.log(
        `  ${label}: ${inserted.toLocaleString()} / ${rows.length.toLocaleString()} rows inserted`
      );
    }
  }

  return inserted;
}

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn: string,
  batchSize: number,
  label: string
): Promise<number> {
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: conflictColumn });

    if (error) {
      console.error(
        `  Error upserting ${label} batch ${Math.floor(i / batchSize) + 1}: ${error.message}`
      );
      continue;
    }

    upserted += batch.length;

    if ((Math.floor(i / batchSize) + 1) % 10 === 0) {
      console.log(
        `  ${label}: ${upserted.toLocaleString()} / ${rows.length.toLocaleString()} rows upserted`
      );
    }
  }

  return upserted;
}

// ---------------------------------------------------------------------------
// Index management — drop before bulk insert, recreate after
// ---------------------------------------------------------------------------

async function dropChargeIndexes(pool: PgPool): Promise<void> {
  console.log("\n=== Dropping charges indexes for bulk load ===\n");
  for (const idx of CHARGE_INDEXES) {
    try {
      await pool.query(`DROP INDEX IF EXISTS ${idx.name}`);
      console.log(`  Dropped ${idx.name}`);
    } catch (err) {
      console.warn(
        `  Warning dropping ${idx.name}: ${err instanceof Error ? err.message : err}`
      );
    }
  }
}

async function createChargeIndexes(pool: PgPool): Promise<void> {
  console.log("\n=== Recreating charges indexes ===\n");
  for (const idx of CHARGE_INDEXES) {
    const start = Date.now();
    console.log(`  Creating ${idx.name}...`);
    try {
      // Get a dedicated connection and disable statement timeout —
      // index creation on 13M rows can take several minutes per index
      const client = await pool.connect();
      await client.query("SET statement_timeout = 0");
      await client.query(idx.sql);
      client.release();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  Created ${idx.name} (${elapsed}s)`);
    } catch (err) {
      console.error(
        `  ERROR creating ${idx.name}: ${err instanceof Error ? err.message : err}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Post-import verification
// ---------------------------------------------------------------------------

async function verifyImport(pool: PgPool): Promise<void> {
  console.log("\n=== Post-Import Verification ===\n");

  // Total row count
  const countRes = await pool.query("SELECT COUNT(*) as cnt FROM charges");
  console.log(
    `  Total charges: ${parseInt(countRes.rows[0].cnt, 10).toLocaleString()}`
  );

  // Lineage coverage: rows imported before #59 have no source_charge_id
  const lineageRes = await pool.query(
    "SELECT COUNT(*) as cnt FROM charges WHERE source_charge_id IS NULL"
  );
  console.log(
    `  Charges without source_charge_id (pre-#59, need re-import): ${parseInt(lineageRes.rows[0].cnt, 10).toLocaleString()}`
  );

  // State coverage
  const stateRes = await pool.query(`
    SELECT p.state, COUNT(*) as cnt
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    GROUP BY p.state
    ORDER BY p.state
  `);
  console.log(`  States with data: ${stateRes.rows.length}`);
  for (const row of stateRes.rows) {
    console.log(`    ${row.state}: ${parseInt(row.cnt, 10).toLocaleString()}`);
  }

  // Distinct codes
  const cptRes = await pool.query(
    "SELECT COUNT(DISTINCT cpt) as cnt FROM charges WHERE cpt IS NOT NULL"
  );
  const hcpcsRes = await pool.query(
    "SELECT COUNT(DISTINCT hcpcs) as cnt FROM charges WHERE hcpcs IS NOT NULL"
  );
  const drgRes = await pool.query(
    "SELECT COUNT(DISTINCT ms_drg) as cnt FROM charges WHERE ms_drg IS NOT NULL"
  );
  console.log(`  Distinct CPT codes: ${cptRes.rows[0].cnt}`);
  console.log(`  Distinct HCPCS codes: ${hcpcsRes.rows[0].cnt}`);
  console.log(`  Distinct MS-DRG codes: ${drgRes.rows[0].cnt}`);

  // Orphan check
  const orphanRes = await pool.query(`
    SELECT COUNT(*) as cnt FROM charges c
    LEFT JOIN providers p ON c.provider_id = p.id
    WHERE p.id IS NULL
  `);
  const orphans = parseInt(orphanRes.rows[0].cnt, 10);
  console.log(`  Orphan charges (no valid provider): ${orphans}`);
  if (orphans > 0)
    console.warn(`  WARNING: ${orphans} charges have invalid provider_id`);

  // Price coverage
  const priceRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE cash_price IS NOT NULL) as has_cash,
      COUNT(*) FILTER (WHERE gross_charge IS NOT NULL) as has_gross,
      COUNT(*) FILTER (WHERE avg_negotiated_rate IS NOT NULL) as has_avg_rate
    FROM charges
  `);
  const p = priceRes.rows[0];
  console.log(
    `  Rows with cash_price: ${parseInt(p.has_cash, 10).toLocaleString()}`
  );
  console.log(
    `  Rows with gross_charge: ${parseInt(p.has_gross, 10).toLocaleString()}`
  );
  console.log(
    `  Rows with avg_negotiated_rate: ${parseInt(p.has_avg_rate, 10).toLocaleString()}`
  );

  // Index existence
  const idxRes = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'charges' ORDER BY indexname
  `);
  console.log(
    `  Indexes on charges: ${idxRes.rows.map((r: { indexname: string }) => r.indexname).join(", ")}`
  );
}

// ---------------------------------------------------------------------------
// Step 1: Import hospitals → providers
// ---------------------------------------------------------------------------

async function importProviders(
  db: Database,
  supabase: SupabaseClient,
  config: ReturnType<typeof parseArgs>
): Promise<Map<number, string>> {
  console.log("\n=== Step 1: Importing hospitals → providers ===\n");

  // Only import completed hospitals (those with actual charge data)
  const hospitals = (await db.all(
    `SELECT hospital_id, hospital_name, hospital_address, hospital_location,
            hospital_city, hospital_state, last_updated_on, status
     FROM hospitals
     WHERE status = 'completed'
     ORDER BY hospital_id`
  )) as unknown as OraHospital[];
  console.log(
    `  Found ${hospitals.length.toLocaleString()} completed hospitals in Oria data`
  );

  // Geocode using zip codes from addresses
  let geocoded = 0;
  let noZip = 0;
  const noLookup = 0;

  const providerRows: Record<string, unknown>[] = [];

  for (const hospital of hospitals) {
    const geo = geocodeByZip(
      hospital.hospital_address,
      hospital.hospital_state,
      hospital.hospital_city
    );

    if (!hospital.hospital_address) {
      noZip++;
    } else if (!geo) {
      noZip++;
    } else {
      geocoded++;
    }

    providerRows.push({
      name: hospital.hospital_name,
      address: nullify(hospital.hospital_address),
      city: nullify(hospital.hospital_city),
      state: nullify(hospital.hospital_state)?.toUpperCase() || null,
      zip: geo?.zip || null,
      lat: geo?.lat || null,
      lng: geo?.lng || null,
      provider_type: "hospital",
      trilliant_hospital_id: Number(hospital.hospital_id), // DuckDB returns BigInt
      last_updated: hospital.last_updated_on || null,
    });
  }

  console.log(
    `  Geocoded: ${geocoded} hospitals, ${noZip} missing zip, ${noLookup} failed lookup`
  );

  // Upsert into Supabase
  const upserted = await batchUpsert(
    supabase,
    "providers",
    providerRows,
    "trilliant_hospital_id",
    config.batchSize,
    "providers"
  );
  console.log(`  Upserted ${upserted.toLocaleString()} providers`);

  // Build mapping: trilliant_hospital_id → supabase provider UUID
  console.log("  Building provider ID mapping...");
  const idMap = new Map<number, string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, trilliant_hospital_id")
      .not("trilliant_hospital_id", "is", null)
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error(`  Error fetching provider IDs: ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.trilliant_hospital_id != null) {
        idMap.set(Number(row.trilliant_hospital_id), row.id);
      }
    }

    offset += pageSize;
  }

  console.log(`  Mapped ${idMap.size.toLocaleString()} provider IDs`);
  return idMap;
}

// ---------------------------------------------------------------------------
// Step 2: Import standard_charges → charges
//
// Instead of scanning all 274M rows (which froze the machine), this:
//   - Filters to only our 1,010 curated CPT/HCPCS codes
//   - Checks BOTH the cpt AND hcpcs columns (many hospitals code under hcpcs)
//   - Includes all settings (inpatient/outpatient/both) — the code list defines shoppability
//   - Processes state-by-state to keep DuckDB memory usage manageable
//     (each state scans a smaller partition of the Parquet files)
// ---------------------------------------------------------------------------

async function importCharges(
  db: Database,
  pgPool: PgPool,
  providerIdMap: Map<number, string>,
  codes: string[],
  config: ReturnType<typeof parseArgs>
): Promise<void> {
  console.log("\n=== Step 2: Importing standard_charges → charges ===\n");

  // Build the SQL IN list from our curated codes
  const codeList = codes.map((c) => `'${c}'`).join(",");

  // The WHERE clause: match our curated codes in any billing code column
  // Setting (inpatient/outpatient/both) is kept as metadata, not used as a filter —
  // the code list itself defines shoppability.
  const codeFilter = `(cpt IN (${codeList}) OR hcpcs IN (${codeList}) OR ms_drg IN (${codeList}))`;

  // Get list of states to process one at a time (keeps Parquet scans small)
  let states: string[];
  if (config.state) {
    states = [config.state];
  } else {
    const stateRows = (await db.all(
      `SELECT DISTINCT hospital_state FROM hospitals WHERE status = 'completed' ORDER BY hospital_state`
    )) as unknown as { hospital_state: string }[];
    states = stateRows.map((r) => r.hospital_state).filter(Boolean);
  }
  console.log(`  Processing ${states.length} states: ${states.join(", ")}`);

  // Derive progress key from the codes file name (or default)
  const progressKey = config.codesFile
    ? basename(config.codesFile, ".json")
    : "trilliant_oria";
  if (config.codesFile) {
    console.log(`  Progress key: "${progressKey}" (targeted import)`);
  }

  // Auto-resume via progress file
  // States in the file completed successfully → skip them.
  // States NOT in the file get DELETE + reimport (cleans up partial data from crashes).
  // Explicit --state flag bypasses progress check (user said "import this state").
  let completedStates = new Set<string>();
  if (!config.fresh && !config.state) {
    const progress = loadProgress();
    const progressStates = Object.keys(progress[progressKey] || {});
    for (const st of progressStates) {
      completedStates.add(st);
    }

    // Bootstrap: if no progress file exists but DB has data, seed the progress file
    // from Supabase row counts (one-time migration for pre-tracking imports).
    // Only applies to default imports — targeted imports always start fresh.
    if (progressStates.length === 0 && !config.codesFile) {
      const existingRes = await pgPool.query(`
        SELECT p.state, COUNT(*) as cnt
        FROM charges c JOIN providers p ON c.provider_id = p.id
        WHERE c.source = 'trilliant_oria'
        GROUP BY p.state
      `);
      let bootstrapped = 0;
      for (const row of existingRes.rows) {
        if (row.state && parseInt(row.cnt, 10) > 0) {
          completedStates.add(row.state);
          saveStateProgress(progressKey, row.state, parseInt(row.cnt, 10));
          bootstrapped++;
        }
      }
      if (bootstrapped > 0) {
        console.log(
          `  Bootstrapped progress file from DB: ${bootstrapped} states recorded`
        );
      }
    }

    if (completedStates.size > 0) {
      console.log(
        `  Auto-resume: ${completedStates.size} states completed: ${[...completedStates].sort().join(", ")}`
      );
    }
  }

  // charge_id must be unique within each hospital across the import scope.
  // Oria numbers rows per hospital file, so the same charge_id at two
  // hospitals is normal; a repeat inside one hospital would let one of its
  // rows overwrite another via ON CONFLICT (provider_id, source_charge_id)
  // DO UPDATE — wrong data is worse than none, so stop before any TRUNCATE
  // or DELETE. One DuckDB scan over the code-filtered scope.
  await assertChargeIdsUnique(db, codeFilter);

  // Handle existing data based on mode
  if (config.fresh) {
    console.log("  TRUNCATING charges table for fresh import...");
    await pgPool.query("TRUNCATE charges CASCADE");
    console.log("  Truncated — verifying connection survived DDL...");
    await new Promise((r) => setTimeout(r, 2000));
    await pgPool.query("SELECT 1");
    console.log("  Connection healthy after TRUNCATE");
    completedStates = new Set(); // clear after truncate
    deleteProgressFile();
  }

  const CIRCUIT_BREAKER_THRESHOLD = 10;
  const touchedProviders = new Set<string>();
  let totalInserted = 0;
  let totalSkipped = 0;
  const importStart = Date.now();
  const importTimestamp = new Date().toISOString();
  const numCols = CHARGE_COLUMNS.length;

  for (const state of states) {
    // Skip already-imported states (from --skip-states flag OR auto-resume)
    if (config.skipStates.includes(state) || completedStates.has(state)) {
      console.log(`  ${state}: skipping (already has data)`);
      continue;
    }

    // Health check before committing to a state scan
    try {
      await pgPool.query("SELECT 1");
    } catch {
      console.warn(`  ${state}: Postgres health check failed, waiting 10s...`);
      await new Promise((r) => setTimeout(r, 10000));
      try {
        await pgPool.query("SELECT 1");
        console.log(`  ${state}: reconnected after retry`);
      } catch (retryErr) {
        console.error(
          `  ${state}: SKIPPING — Postgres unreachable (${retryErr instanceof Error ? retryErr.message : retryErr})`
        );
        continue;
      }
    }

    const stateStart = Date.now();

    // Pre-import: expected row count from DuckDB for reconciliation, from
    // the same query the import streams (one row per distinct price)
    const expectedRes = (await db.all(
      `SELECT COUNT(*) as cnt FROM (${buildChargeSelect({ state, codeFilter })})`
    )) as unknown as { cnt: number | bigint }[];
    const expectedCount = Number(expectedRes[0].cnt);

    // Clean up any partial data from a previous interrupted import.
    // This runs for every non-skipped state — if the state was complete, it was
    // already skipped above. If we're here, the state needs a fresh import.
    // When --codes is active, scoped DELETE targets only those codes (safe for
    // additive imports, crash recovery, and price refreshes). Otherwise, delete
    // all charges for the state.
    // One DELETE per code column: OR-ing them makes Postgres walk every charge
    // of every hospital in the state, which times out on the full table.
    // Separately, each uses its (code, provider) index.
    const deleteSql = `DELETE FROM charges c
       USING providers p
       WHERE c.provider_id = p.id
         AND UPPER(TRIM(p.state)) = $1
         AND c.source = 'trilliant_oria'`;
    let deletedCount = 0;
    for (const codeColumn of config.codesFile
      ? ["cpt", "hcpcs", "ms_drg"]
      : [null]) {
      const deleteRes = await pgPool.query(
        codeColumn ? `${deleteSql} AND c.${codeColumn} = ANY($2)` : deleteSql,
        codeColumn ? [state, codes] : [state]
      );
      deletedCount += deleteRes.rowCount ?? 0;
    }
    if (deletedCount > 0) {
      console.log(
        `  ${state}: deleted ${deletedCount.toLocaleString()} existing charges (${config.codesFile ? "scoped to target codes" : "partial/stale data"})`
      );
    }

    let stateInserted = 0;
    let stateUpdated = 0;
    let stateSkipped = 0;
    // Rows a crawled price file already covers (lib/data/crawler-overlap.ts)
    let stateCrawled = 0;
    let consecutiveFailures = 0;
    let circuitBreakerTriggered = false;
    let batchNum = 0;

    const stream = db.stream(
      buildChargeSelect({ state, codeFilter, limit: config.limit })
    );

    let batch: Record<string, unknown>[] = [];

    for await (const row of stream) {
      const charge = row as unknown as OraStandardCharge;
      const providerId = providerIdMap.get(Number(charge.hospital_id));
      if (!providerId) {
        stateSkipped++;
        continue;
      }
      touchedProviders.add(providerId);

      batch.push({
        provider_id: providerId,
        description: charge.description || null,
        setting: normalizeSetting(charge.setting),
        billing_class: normalizeBillingClass(charge.billing_class),
        cpt: charge.cpt || null,
        hcpcs: charge.hcpcs || null,
        ms_drg: charge.ms_drg || null,
        revenue_code: charge.rc || null,
        ndc: charge.ndc || null,
        icd: charge.icd || null,
        modifiers: charge.modifiers || null,
        laterality: parseLaterality(charge.description, charge.modifiers),
        body_site: parseBodySite(charge.description),
        gross_charge:
          charge.gross_charge != null ? Number(charge.gross_charge) : null,
        cash_price:
          charge.discounted_cash != null
            ? Number(charge.discounted_cash)
            : null,
        min_price: charge.minimum != null ? Number(charge.minimum) : null,
        max_price: charge.maximum != null ? Number(charge.maximum) : null,
        avg_negotiated_rate:
          charge.avg_negotiated_rate != null
            ? Number(charge.avg_negotiated_rate)
            : null,
        min_negotiated_rate:
          charge.min_negotiated_rate != null
            ? Number(charge.min_negotiated_rate)
            : null,
        max_negotiated_rate:
          charge.max_negotiated_rate != null
            ? Number(charge.max_negotiated_rate)
            : null,
        payer_count:
          charge.payer_count != null ? Number(charge.payer_count) : null,
        source: "trilliant_oria",
        imported_at: importTimestamp,
        // Passed as text so a BIGINT beyond 2^53 survives; Postgres casts it.
        source_charge_id:
          charge.charge_id != null ? String(charge.charge_id) : null,
      });

      if (batch.length >= config.batchSize) {
        // DIRECT AWAIT — guarantees backpressure. Nothing buffers while this runs.
        const { keep, crawled } = await withoutCrawledRows(pgPool, batch);
        stateCrawled += crawled;
        const { inserted, updated } = await flushOneBatch(
          pgPool,
          keep,
          `charges [${state}]`,
          numCols
        );
        if (inserted + updated > 0 || keep.length === 0) {
          stateInserted += inserted;
          stateUpdated += updated;
          totalInserted += inserted;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
        }
        batch = [];
        batchNum++;

        // Circuit breaker
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          console.error(
            `  ${state}: CIRCUIT BREAKER — ${consecutiveFailures} consecutive failures, skipping rest of state`
          );
          circuitBreakerTriggered = true;
          break;
        }

        // Progress logging every 20 batches (~10,000 rows)
        if (batchNum % 20 === 0) {
          const heapMB = Math.round(
            process.memoryUsage().heapUsed / 1024 / 1024
          );
          const elapsed = (Date.now() - importStart) / 1000;
          const rowsPerSec =
            totalInserted > 0 ? (totalInserted / elapsed).toFixed(0) : "—";
          console.log(
            `  ${state}: ${stateInserted.toLocaleString()} inserted, ` +
              `${stateSkipped} skipped — ${elapsed.toFixed(0)}s elapsed — heap: ${heapMB}MB — ` +
              `total: ${totalInserted.toLocaleString()} — ${rowsPerSec} rows/s`
          );
        }
      }
    }

    // Flush remaining partial batch
    if (batch.length > 0) {
      const { keep, crawled } = await withoutCrawledRows(pgPool, batch);
      stateCrawled += crawled;
      const { inserted, updated } = await flushOneBatch(
        pgPool,
        keep,
        `charges [${state}]`,
        numCols
      );
      stateInserted += inserted;
      stateUpdated += updated;
      totalInserted += inserted;
    }

    totalSkipped += stateSkipped;
    const stateDuration = ((Date.now() - stateStart) / 1000).toFixed(1);
    const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const processedCount =
      stateInserted + stateUpdated + stateSkipped + stateCrawled;
    if (stateCrawled > 0) {
      console.log(
        `  ${state}: ${stateCrawled.toLocaleString()} rows left out — the hospital's crawled price file covers the code`
      );
    }
    if (stateUpdated > 0) {
      // Expected only for a retried batch, or rows the DELETE above didn't
      // reach (e.g. a provider whose state was corrected after import).
      console.log(
        `  ${state}: ${stateUpdated.toLocaleString()} rows already present (same provider + source_charge_id) — updated in place`
      );
    }
    console.log(
      `  ${state}: ${stateInserted.toLocaleString()} inserted, ${stateSkipped} skipped ` +
        `(${stateDuration}s) — heap: ${heapMB}MB — running total: ${totalInserted.toLocaleString()}`
    );

    // Reconciliation: compare processed rows against DuckDB expected count
    if (processedCount !== expectedCount) {
      console.warn(
        `  ${state}: RECONCILIATION MISMATCH — expected ${expectedCount.toLocaleString()} rows from DuckDB, ` +
          `processed ${processedCount.toLocaleString()} (${stateInserted.toLocaleString()} inserted + ${stateUpdated.toLocaleString()} updated + ${stateSkipped} skipped + ${stateCrawled.toLocaleString()} crawled)`
      );
    } else {
      console.log(
        `  ${state}: reconciliation OK — ${processedCount.toLocaleString()} rows match DuckDB expected count`
      );
    }

    // Record successful completion (skip if circuit breaker tripped or limit/test mode)
    if (
      !circuitBreakerTriggered &&
      config.limit === 0 &&
      stateInserted + stateUpdated > 0
    ) {
      saveStateProgress(
        progressKey,
        state,
        stateInserted + stateUpdated,
        expectedCount,
        stateSkipped
      );
    }

    // Respect --limit across all states
    if (config.limit > 0 && totalInserted >= config.limit) {
      console.log(
        `  Reached limit of ${config.limit.toLocaleString()}, stopping`
      );
      break;
    }
  }

  const totalDuration = ((Date.now() - importStart) / 1000 / 60).toFixed(1);
  console.log(
    `\n  Charges import complete: ${totalInserted.toLocaleString()} inserted, ` +
      `${totalSkipped.toLocaleString()} skipped (${totalDuration} min)`
  );

  await refreshCashRatios(pgPool, [...touchedProviders]);
}

// Per-hospital cash ratios for the hospitals this run loaded, a few hundred
// per call. The no-argument refresh_provider_cash_ratios() aggregates all of
// charges and then refresh_code_price_reference(), which outruns the
// statement timeout; the nightly 04:00 job refreshes code_price_reference.
async function refreshCashRatios(
  pgPool: PgPool,
  providerIds: string[]
): Promise<void> {
  const BATCH = 400;
  for (let i = 0; i < providerIds.length; i += BATCH) {
    await pgPool.query("SELECT refresh_provider_cash_ratios($1::uuid[])", [
      providerIds.slice(i, i + BATCH),
    ]);
  }
  if (providerIds.length > 0) {
    console.log(
      `  Cash ratios refreshed for ${providerIds.length.toLocaleString()} hospitals`
    );
  }
}

// Single batch upsert with retry. Returns rows newly inserted vs. updated in
// place (both 0 on total failure). Upserting on (provider_id, source_charge_id) makes a retry
// idempotent: if an attempt committed but its ack was lost, the retry updates
// the same rows instead of duplicating them.
// Each attempt gets a FRESH connection from the pool — no reusing broken ones.
async function flushOneBatch(
  pgPool: PgPool,
  rows: Record<string, unknown>[],
  label: string,
  numCols: number
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  // Build the SQL and values array
  // Strip null bytes (0x00) from text fields — Postgres UTF8 rejects them
  const sanitize = (v: unknown) =>
    typeof v === "string" ? v.replace(/\x00/g, "") : v;

  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const placeholders: string[] = [];
    for (let c = 0; c < numCols; c++) {
      values.push(sanitize(row[CHARGE_COLUMNS[c]]) ?? null);
      placeholders.push(`$${r * numCols + c + 1}`);
    }
    rowPlaceholders.push(`(${placeholders.join(",")})`);
  }
  // The conflict target matches the partial unique index
  // idx_charges_provider_source_charge_id, so a charge_id can only ever
  // update its own hospital's row.
  // xmax = 0 on a returned row means it was inserted rather than updated.
  const sql =
    `INSERT INTO charges (${CHARGE_COLUMNS.join(",")}) VALUES ${rowPlaceholders.join(",")} ` +
    `ON CONFLICT ${CHARGE_LINEAGE_CONFLICT} DO UPDATE SET ` +
    CHARGE_UPDATE_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(", ") +
    `, last_updated = now()` +
    ` RETURNING (xmax = 0) AS inserted`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client: import("pg").PoolClient | null = null;
    try {
      client = await pgPool.connect();
      const res = await client.query<{ inserted: boolean }>(sql, values);
      client.release();
      const inserted = res.rows.filter((r) => r.inserted).length;
      return { inserted, updated: res.rows.length - inserted };
    } catch (err: unknown) {
      if (client) client.release(true); // destroy broken connection
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        const wait = attempt * 5000; // 5s, 10s backoff — give Supabase time to recover
        console.warn(
          `  ${label}: attempt ${attempt} failed, retrying in ${wait / 1000}s... (${msg})`
        );
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.error(
          `  ${label}: FAILED after 3 attempts: ${msg} (${rows.length} rows lost)`
        );
      }
    }
  }
  return { inserted: 0, updated: 0 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log("=== ClearCost Trilliant Oria Import ===\n");
  console.log(`  DuckDB path: ${config.dbPath}`);
  console.log(`  Batch size: ${config.batchSize}`);
  console.log(`  Fresh import: ${config.fresh}`);
  if (config.codesFile)
    console.log(`  Targeted codes file: ${config.codesFile}`);
  if (config.limit > 0)
    console.log(`  Limit: ${config.limit.toLocaleString()} charges`);
  if (config.state) console.log(`  State filter: ${config.state}`);
  if (config.skipStates.length > 0)
    console.log(`  Skipping states: ${config.skipStates.join(", ")}`);

  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Make sure .env.local is loaded. Run with:\n" +
        "  npx tsx --env-file=.env.local lib/data/import-trilliant.ts"
    );
    process.exit(1);
  }

  if (!dbUrl) {
    console.error(
      "\nMissing SUPABASE_DB_URL.\n" +
        "Get it from Supabase Dashboard → Settings → Database → Connection string (URI).\n" +
        "Add to .env.local as: SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...:5432/postgres\n"
    );
    process.exit(1);
  }

  // Verify DuckDB file exists
  if (!existsSync(config.dbPath)) {
    console.error(
      `\nDuckDB file not found at: ${config.dbPath}\n\n` +
        "Download the Oria data from https://oria-data.trillianthealth.com/docs\n" +
        "Extract to lib/data/ (should produce mrf_lake/ directory with mrf_lake.duckdb + parquet/)\n"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Use Supabase's connection pooler (port 6543, transaction mode) instead of
  // direct Postgres (port 5432). The pooler handles reconnection and multiplexing
  // on Supabase's side — critical for sustained bulk inserts over the internet.
  // Direct connections get killed by Supabase's load balancer under sustained load.
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const isPooler = poolerUrl !== dbUrl;
  console.log(
    `  Connecting via ${isPooler ? "Supabase pooler (port 6543)" : "direct Postgres"}...`
  );

  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 3, // small pool — pooler manages the real connections
    idleTimeoutMillis: 30000, // release idle connections after 30s
    connectionTimeoutMillis: 30000, // 30s to get a connection from pooler
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pgPool.on("error", (err) => {
    console.warn(`  Pool background error (non-fatal): ${err.message}`);
  });
  await pgPool.query("SELECT 1");
  console.log(`  Postgres pool connected (SSL, keepalive, pooler=${isPooler})`);

  // Open DuckDB — MUST use the directory containing the DB as CWD
  // because the views reference relative paths to parquet/ files
  const originalCwd = process.cwd();
  const dbDir = dirname(config.dbPath);
  process.chdir(dbDir);
  console.log(
    `\n  Changed CWD to ${dbDir} (required for DuckDB relative parquet paths)`
  );

  console.log("  Opening DuckDB database...");
  const db = await Database.create(config.dbPath, { access_mode: "READ_ONLY" });

  // Prevent DuckDB from consuming all RAM when scanning 81GB of Parquet
  await db.run(`SET memory_limit = '2GB'`);
  await db.run(`SET threads = 2`);
  console.log("  DuckDB memory_limit=2GB, threads=2");

  // Load the code list — either a targeted subset or the full curated list
  let importCodes: string[];
  if (config.codesFile) {
    importCodes = JSON.parse(readFileSync(config.codesFile, "utf8"));
    console.log(
      `  TARGETED MODE: ${importCodes.length} codes from ${config.codesFile}`
    );
    config.skipProviders = true; // providers already loaded from base import
  } else {
    const codesPath = resolve(__dirname, "final-codes.json");
    importCodes = JSON.parse(readFileSync(codesPath, "utf8"));
    console.log(`  Loaded ${importCodes.length} codes from final-codes.json`);
  }

  // Verify tables are accessible
  const tables = (await db.all(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name`
  )) as unknown as { table_name: string }[];
  console.log(
    `  Available tables: ${tables.map((t) => t.table_name).join(", ")}`
  );

  try {
    // Step 1: Import providers
    let providerIdMap: Map<number, string>;

    if (!config.skipProviders) {
      providerIdMap = await importProviders(db, supabase, config);
    } else {
      console.log(
        "\n  Skipping provider import, building ID map from existing data..."
      );
      providerIdMap = new Map();
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("providers")
          .select("id, trilliant_hospital_id")
          .not("trilliant_hospital_id", "is", null)
          .range(offset, offset + pageSize - 1);
        if (error || !data || data.length === 0) break;
        for (const row of data) {
          if (row.trilliant_hospital_id != null) {
            providerIdMap.set(row.trilliant_hospital_id, row.id);
          }
        }
        offset += pageSize;
      }
      console.log(`  Loaded ${providerIdMap.size} existing provider mappings`);
    }

    // Step 2: Import charges (filtered to curated codes, all settings)
    if (!config.skipCharges) {
      // Phase A: Drop indexes for reliable bulk loading (only for full fresh reimports)
      if (config.fresh && !config.codesFile) {
        await dropChargeIndexes(pgPool);
      }

      // Phase B: Bulk insert all charges
      await importCharges(db, pgPool, providerIdMap, importCodes, config);

      // Phase C: Recreate indexes (only if we dropped them)
      if (config.fresh && !config.codesFile) {
        await createChargeIndexes(pgPool);
      }
    } else {
      console.log("\n  Skipping charges import");
    }

    // Step 3: Verify results
    await verifyImport(pgPool);

    console.log("\n=== Import Complete ===\n");
  } finally {
    await pgPool.end();
    await db.close();
    process.chdir(originalCwd);
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});

export { main as importTrilliantData };
