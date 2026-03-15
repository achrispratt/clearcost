/**
 * Backfill script: inserts inpatient-setting charges that were excluded by the
 * original import filter. Only targets rows where setting='inpatient' for our
 * 1,002 curated codes — roughly 6K rows.
 *
 * Run with:
 *   npx tsx --env-file=.env.local lib/data/backfill-inpatient.ts
 *
 * Options:
 *   --limit <n>    Limit total rows inserted (for testing, e.g. --limit 100)
 *   --dry-run      Query DuckDB and report counts without inserting
 */

import { createClient } from "@supabase/supabase-js";
import { Database } from "duckdb-async";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { Pool as PgPool } from "pg";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = resolve(__dirname, "mrf_lake/mrf_lake.duckdb");
const BATCH_SIZE = 500;

// Column order for INSERT INTO charges — must match import-trilliant.ts
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
  "gross_charge",
  "cash_price",
  "min_price",
  "max_price",
  "avg_negotiated_rate",
  "min_negotiated_rate",
  "max_negotiated_rate",
  "payer_count",
  "source",
] as const;

const NUM_COLS = CHARGE_COLUMNS.length;

// ---------------------------------------------------------------------------
// Types (mirrors import-trilliant.ts)
// ---------------------------------------------------------------------------

interface OraStandardCharge {
  charge_id: number;
  hospital_id: number;
  description: string | null;
  gross_charge: number | null;
  discounted_cash: number | null;
  minimum: number | null;
  maximum: number | null;
  setting: string | null;
  billing_class: string | null;
  modifiers: string | null;
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  rc: string | null;
  ndc: string | null;
  icd: string | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
  max_negotiated_rate: number | null;
  payer_count: number | null;
}

// ---------------------------------------------------------------------------
// flushOneBatch — identical to import-trilliant.ts
// ---------------------------------------------------------------------------

async function flushOneBatch(
  pgPool: PgPool,
  rows: Record<string, unknown>[],
  label: string
): Promise<number> {
  const sanitize = (v: unknown) =>
    typeof v === "string" ? v.replace(/\x00/g, "") : v;

  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const placeholders: string[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      values.push(sanitize(row[CHARGE_COLUMNS[c]]) ?? null);
      placeholders.push(`$${r * NUM_COLS + c + 1}`);
    }
    rowPlaceholders.push(`(${placeholders.join(",")})`);
  }
  const sql = `INSERT INTO charges (${CHARGE_COLUMNS.join(",")}) VALUES ${rowPlaceholders.join(",")}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let client: import("pg").PoolClient | null = null;
    try {
      client = await pgPool.connect();
      await client.query(sql, values);
      client.release();
      return rows.length;
    } catch (err: unknown) {
      if (client) client.release(true);
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        const wait = attempt * 5000;
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
  return 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
  const dryRun = args.includes("--dry-run");

  console.log("=== ClearCost Inpatient Backfill ===\n");
  if (dryRun) console.log("  *** DRY RUN — no rows will be inserted ***\n");
  if (limit > 0) console.log(`  Limit: ${limit.toLocaleString()} rows`);

  // Validate environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\nRun with: npx tsx --env-file=.env.local lib/data/backfill-inpatient.ts"
    );
    process.exit(1);
  }
  if (!dbUrl) {
    console.error(
      "\nMissing SUPABASE_DB_URL.\nAdd to .env.local (get from Supabase Dashboard → Settings → Database → Connection string)."
    );
    process.exit(1);
  }

  // Connect to Supabase
  const supabase = createClient(supabaseUrl, supabaseKey);
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pgPool.on("error", (err) => {
    console.warn(`  Pool background error (non-fatal): ${err.message}`);
  });
  await pgPool.query("SELECT 1");
  console.log("  Postgres pool connected");

  // Build provider ID map from Supabase (trilliant_hospital_id → UUID)
  const providerIdMap = new Map<number, string>();
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
  console.log(`  Loaded ${providerIdMap.size} provider mappings`);

  // Open DuckDB — CWD must be the directory containing the DB
  const dbDir = dirname(DB_PATH);
  process.chdir(dbDir);
  console.log(`  CWD → ${dbDir}`);

  const db = await Database.create(DB_PATH, { access_mode: "READ_ONLY" });
  await db.run(`SET memory_limit = '2GB'`);
  await db.run(`SET threads = 2`);
  console.log("  DuckDB open (memory_limit=2GB, threads=2)");

  // Load curated codes
  const codesPath = resolve(__dirname, "final-codes.json");
  const codes: string[] = JSON.parse(readFileSync(codesPath, "utf8"));
  const codeList = codes.map((c) => `'${c}'`).join(",");
  console.log(`  Loaded ${codes.length} curated codes`);

  // Count what we'll be inserting
  const countRows = await db.all(`
    SELECT COUNT(*) as cnt
    FROM standard_charges sc
    JOIN hospitals h ON sc.hospital_id = h.hospital_id
    WHERE h.status = 'completed'
      AND (sc.cpt IN (${codeList}) OR sc.hcpcs IN (${codeList}))
      AND TRIM(LOWER(sc.setting)) = 'inpatient'
  `);
  const totalAvailable = Number((countRows[0] as { cnt: bigint }).cnt);
  console.log(
    `\n  Inpatient rows available: ${totalAvailable.toLocaleString()}`
  );

  if (dryRun) {
    // Show per-state breakdown
    const stateBreakdown = (await db.all(`
      SELECT h.hospital_state as state, COUNT(*) as cnt
      FROM standard_charges sc
      JOIN hospitals h ON sc.hospital_id = h.hospital_id
      WHERE h.status = 'completed'
        AND (sc.cpt IN (${codeList}) OR sc.hcpcs IN (${codeList}))
        AND TRIM(LOWER(sc.setting)) = 'inpatient'
      GROUP BY h.hospital_state
      ORDER BY cnt DESC
    `)) as { state: string; cnt: bigint }[];

    console.log("\n  Per-state breakdown:");
    for (const row of stateBreakdown) {
      console.log(`    ${row.state}: ${Number(row.cnt).toLocaleString()}`);
    }

    await db.close();
    await pgPool.end();
    console.log("\n  Dry run complete.");
    return;
  }

  // Query all inpatient rows — state by state to keep DuckDB memory manageable
  const stateRows = (await db.all(
    `SELECT DISTINCT h.hospital_state FROM hospitals h WHERE h.status = 'completed' ORDER BY h.hospital_state`
  )) as { hospital_state: string }[];

  let totalInserted = 0;
  let totalSkipped = 0;
  const startTime = Date.now();

  for (const { hospital_state: state } of stateRows) {
    const rows = (await db.all(`
      SELECT charge_id, hospital_id, description, gross_charge, discounted_cash,
             minimum, maximum, setting, billing_class, modifiers,
             cpt, hcpcs, ms_drg, rc, ndc, icd,
             avg_negotiated_rate, min_negotiated_rate, max_negotiated_rate, payer_count
      FROM standard_charges
      WHERE hospital_state = '${state}'
        AND (cpt IN (${codeList}) OR hcpcs IN (${codeList}) OR ms_drg IN (${codeList}))
        AND TRIM(LOWER(setting)) = 'inpatient'
      ${limit > 0 ? `LIMIT ${limit - totalInserted}` : ""}
    `)) as unknown as OraStandardCharge[];

    if (rows.length === 0) continue;

    // Transform rows
    const batch: Record<string, unknown>[] = [];
    let skipped = 0;

    for (const charge of rows) {
      const providerId = providerIdMap.get(Number(charge.hospital_id));
      if (!providerId) {
        skipped++;
        continue;
      }

      batch.push({
        provider_id: providerId,
        description: charge.description || null,
        setting: charge.setting || null,
        billing_class: charge.billing_class || null,
        cpt: charge.cpt || null,
        hcpcs: charge.hcpcs || null,
        ms_drg: charge.ms_drg || null,
        revenue_code: charge.rc || null,
        ndc: charge.ndc || null,
        icd: charge.icd || null,
        modifiers: charge.modifiers || null,
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
      });
    }

    totalSkipped += skipped;

    // Insert in batches
    for (let i = 0; i < batch.length; i += BATCH_SIZE) {
      const chunk = batch.slice(i, i + BATCH_SIZE);
      const inserted = await flushOneBatch(
        pgPool,
        chunk,
        `backfill [${state}]`
      );
      totalInserted += inserted;
    }

    if (batch.length > 0) {
      console.log(
        `  ${state}: +${batch.length} rows${skipped > 0 ? ` (${skipped} skipped — no provider)` : ""}`
      );
    }

    // Respect --limit
    if (limit > 0 && totalInserted >= limit) {
      console.log(`\n  Reached limit of ${limit.toLocaleString()}`);
      break;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n  Backfill complete: ${totalInserted.toLocaleString()} inserted, ` +
      `${totalSkipped.toLocaleString()} skipped (${duration}s)`
  );

  await db.close();
  await pgPool.end();
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
