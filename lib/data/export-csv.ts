/**
 * Export filtered Oria charge data from DuckDB to per-state CSV files.
 *
 * These CSVs have provider UUIDs already mapped (from Supabase providers table)
 * and columns matching the charges table exactly, ready for psql \COPY.
 *
 * Usage:
 *   npx tsx lib/data/export-csv.ts
 *
 * Output:
 *   /tmp/clearcost-csv/AK.csv, AL.csv, ... (one per state)
 *
 * Then load with:
 *   lib/data/copy-import.sh
 */

import { Database } from "duckdb-async";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = "/tmp/clearcost-csv";
const DB_PATH = resolve(__dirname, "mrf_lake.duckdb");
const CODES_PATH = resolve(__dirname, "final-codes.json");
const PROVIDER_MAP_PATH = "/tmp/provider_map.csv";

async function main() {
  console.log("=== ClearCost CSV Export ===\n");

  // Ensure output directory
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check provider map exists
  if (!existsSync(PROVIDER_MAP_PATH)) {
    console.error(
      `Missing ${PROVIDER_MAP_PATH}\n` +
        "Export it from Supabase first:\n" +
        '  psql "$CONN" -c "\\COPY (SELECT id, trilliant_hospital_id FROM providers WHERE trilliant_hospital_id IS NOT NULL) TO \'/tmp/provider_map.csv\' WITH (FORMAT csv, HEADER true)"'
    );
    process.exit(1);
  }

  // Load curated codes
  const codes: string[] = JSON.parse(readFileSync(CODES_PATH, "utf8"));
  const codeList = codes.map((c) => `'${c}'`).join(",");
  console.log(`  Loaded ${codes.length} codes from final-codes.json`);

  // Open DuckDB (must CWD to lib/data/ for relative parquet paths)
  const originalCwd = process.cwd();
  process.chdir(__dirname);
  console.log(`  CWD: ${__dirname}`);

  const db = await Database.create(DB_PATH, { access_mode: "READ_ONLY" });
  await db.run(`SET memory_limit = '4GB'`);
  await db.run(`SET threads = 4`);

  // Load provider mapping into DuckDB
  await db.run(`
    CREATE TEMPORARY TABLE provider_map AS
    SELECT * FROM read_csv('${PROVIDER_MAP_PATH}',
      header=true,
      columns={'id': 'VARCHAR', 'trilliant_hospital_id': 'INTEGER'})
  `);
  const mapCount = await db.all("SELECT COUNT(*) as cnt FROM provider_map");
  console.log(`  Loaded ${mapCount[0].cnt} provider mappings`);

  // Get state list
  const stateRows = (await db.all(
    `SELECT DISTINCT hospital_state FROM hospitals WHERE status = 'completed' ORDER BY hospital_state`
  )) as unknown as { hospital_state: string }[];
  const states = stateRows.map((r) => r.hospital_state).filter(Boolean);
  console.log(`  ${states.length} states to export: ${states.join(", ")}\n`);

  const codeFilter = `(sc.cpt IN (${codeList}) OR sc.hcpcs IN (${codeList}))
    AND (sc.setting IS NULL OR LOWER(sc.setting) != 'inpatient')`;

  const exportStart = Date.now();

  for (const state of states) {
    const stateStart = Date.now();
    const outPath = `${OUTPUT_DIR}/${state}.csv`;

    await db.run(`
      COPY (
        SELECT
          pm.id as provider_id,
          sc.description,
          sc.setting,
          sc.billing_class,
          sc.cpt,
          sc.hcpcs,
          sc.ms_drg,
          sc.rc as revenue_code,
          sc.ndc,
          sc.icd,
          sc.modifiers,
          sc.gross_charge,
          sc.discounted_cash as cash_price,
          sc.minimum as min_price,
          sc.maximum as max_price,
          sc.avg_negotiated_rate,
          sc.min_negotiated_rate,
          sc.max_negotiated_rate,
          sc.payer_count,
          'trilliant_oria' as source
        FROM standard_charges sc
        JOIN provider_map pm ON sc.hospital_id = pm.trilliant_hospital_id
        WHERE sc.hospital_state = '${state}' AND ${codeFilter}
      ) TO '${outPath}' (HEADER, DELIMITER ',')
    `);

    const fileSize = statSync(outPath).size;
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
    const elapsed = ((Date.now() - stateStart) / 1000).toFixed(1);
    console.log(`  ${state}: ${sizeMB} MB (${elapsed}s)`);
  }

  await db.close();
  process.chdir(originalCwd);

  // Summary
  const totalElapsed = ((Date.now() - exportStart) / 1000).toFixed(0);
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".csv"));
  const totalSizeMB = files
    .reduce((sum, f) => sum + statSync(`${OUTPUT_DIR}/${f}`).size, 0) / 1024 / 1024;

  console.log(`\n=== Export Complete ===`);
  console.log(`  ${files.length} CSV files`);
  console.log(`  ${totalSizeMB.toFixed(0)} MB total CSV data`);
  console.log(`  ${totalElapsed}s elapsed`);
  console.log(`  Output: ${OUTPUT_DIR}/`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
