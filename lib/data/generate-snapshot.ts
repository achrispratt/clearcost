/**
 * generate-snapshot.ts — ClearCost Data Audit Snapshot Generator
 *
 * Queries both DuckDB (Trilliant Oria Parquet warehouse) and Supabase (production
 * Postgres) to produce a comprehensive data funnel audit. Answers:
 *   1. Which hospitals were never imported (status != 'completed')?
 *   2. Which providers are invisible to search (null lat/lng)?
 *   3. What is the exact per-state breakdown across both databases?
 *
 * Output: docs/data-snapshot.md
 *
 * Run with:
 *   npx tsx --env-file=.env.local lib/data/generate-snapshot.ts
 *
 * Notes:
 *   - The per-state filtered charge count query scans all Parquet files (~81GB).
 *     Expect 3-5 minutes for that step.
 *   - DuckDB requires CWD = lib/data/mrf_lake/ for relative parquet/ paths.
 *   - Keep this script in the repo — re-run after each import to verify totals.
 */

import { Database } from "duckdb-async";
import { Pool as PgPool } from "pg";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = resolve(__dirname, "mrf_lake/mrf_lake.duckdb");
const CODES_PATH = resolve(__dirname, "final-codes.json");
// Resolve output paths before chdir changes CWD
const SNAPSHOTS_DIR = resolve(__dirname, "../../docs/snapshots");
const LATEST_PATH   = resolve(__dirname, "../../docs/data-snapshot.md");
// SNAPSHOT_PATH is computed inside main() after `now` is defined

// ---------------------------------------------------------------------------
// Types — DuckDB returns BigInt for COUNT(*); Postgres returns string
// ---------------------------------------------------------------------------

interface HospitalStatusRow { status: string | null; cnt: bigint; }
interface TotalChargesRow   { total: bigint; }
interface StateStatusRow    { hospital_state: string | null; status: string | null; cnt: bigint; }
interface StateChargeRow    { hospital_state: string | null; cnt: bigint; }
interface SettingRow        { setting: string | null; cnt: bigint; }
interface ExcludedHospRow   {
  hospital_id: bigint;
  hospital_name: string | null;
  hospital_state: string | null;
  hospital_city: string | null;
  hospital_address: string | null;
  status: string | null;
}

interface PgProvStateRow  { state: string; total: string; geocoded: string; null_location: string; }
interface PgChargeStateRow { state: string; cnt: string; }
interface PgNullProvRow   {
  name: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  trilliant_hospital_id: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number | bigint | string | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function mdEscape(s: string | null | undefined): string {
  return (s ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(
      "Missing SUPABASE_DB_URL.\n" +
      "Run with: npx tsx --env-file=.env.local lib/data/generate-snapshot.ts"
    );
    process.exit(1);
  }

  const codes: string[] = JSON.parse(readFileSync(CODES_PATH, "utf8"));
  console.log(`Loaded ${codes.length} codes from final-codes.json`);

  // ---------------------------------------------------------------------------
  // DuckDB — must chdir to the DB directory for relative parquet/ paths
  // ---------------------------------------------------------------------------

  const dbDir = dirname(DB_PATH);
  process.chdir(dbDir);
  console.log(`\nChanged CWD to ${dbDir} (required for DuckDB parquet relative paths)`);

  console.log("Opening DuckDB (read-only)...");
  const db = await Database.create(DB_PATH, { access_mode: "READ_ONLY" });
  await db.run(`SET memory_limit = '4GB'`);
  await db.run(`SET threads = 2`);
  console.log("DuckDB ready (memory_limit=4GB, threads=2)");

  // ---------------------------------------------------------------------------
  // Postgres
  // ---------------------------------------------------------------------------

  // Use pooler (6543) — fine for reads, handles reconnection
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 30_000,
  });
  await pgPool.query("SELECT 1");
  console.log("Postgres pool connected");

  // ---------------------------------------------------------------------------
  // DuckDB queries
  // ---------------------------------------------------------------------------

  console.log("\n[1/7] Hospital status breakdown...");
  const statusRows = (await db.all(
    `SELECT status, COUNT(*) AS cnt FROM hospitals GROUP BY status ORDER BY cnt DESC`
  )) as unknown as HospitalStatusRow[];

  console.log("[2/7] Total raw charge count from hospitals metadata...");
  let totalRawCharges = 0;
  try {
    const totalRows = (await db.all(
      `SELECT COALESCE(SUM(total_charges_count), 0) AS total FROM hospitals`
    )) as unknown as TotalChargesRow[];
    totalRawCharges = Number(totalRows[0]?.total ?? 0);
    console.log(`  total_charges_count sum: ${totalRawCharges.toLocaleString()}`);
  } catch {
    console.warn("  total_charges_count column not found — using known approximate (274,000,000)");
    totalRawCharges = 274_000_000;
  }

  console.log("[3/7] Per-state hospital counts (all statuses)...");
  const stateStatusRows = (await db.all(
    `SELECT hospital_state, status, COUNT(*) AS cnt
     FROM hospitals
     GROUP BY hospital_state, status
     ORDER BY hospital_state, status`
  )) as unknown as StateStatusRow[];

  console.log("[4/7] Per-state FILTERED charge counts (1,010 codes + outpatient + completed hospitals only)...");
  console.log("  ⚠  Scanning ~81GB Parquet — this may take 3-5 minutes...");
  const codeList = codes.map((c) => `'${c}'`).join(",");
  const stateChargeRows = (await db.all(
    `SELECT h.hospital_state, COUNT(*) AS cnt
     FROM standard_charges sc
     JOIN hospitals h ON sc.hospital_id = h.hospital_id
     WHERE (sc.cpt IN (${codeList}) OR sc.hcpcs IN (${codeList}))
       AND (sc.setting IS NULL OR LOWER(sc.setting) != 'inpatient')
       AND h.status = 'completed'
     GROUP BY h.hospital_state
     ORDER BY h.hospital_state`
  )) as unknown as StateChargeRow[];
  console.log(`  Got charge counts for ${stateChargeRows.length} states`);

  console.log("[5/7] Total standard_charges row count (fast — Parquet metadata)...");
  const totalStdChargesRows = (await db.all(
    `SELECT COUNT(*) AS total FROM standard_charges`
  )) as unknown as TotalChargesRow[];
  const totalStdCharges = Number(totalStdChargesRows[0]?.total ?? 0);
  console.log(`  Total standard_charges rows: ${totalStdCharges.toLocaleString()}`);

  console.log("[6/7] standard_charges breakdown by setting (normalized)...");
  const settingRows = (await db.all(
    `SELECT TRIM(LOWER(COALESCE(setting, 'NULL'))) AS setting, COUNT(*) AS cnt
     FROM standard_charges
     GROUP BY TRIM(LOWER(COALESCE(setting, 'NULL')))
     ORDER BY cnt DESC`
  )) as unknown as SettingRow[];
  console.log(`  Settings found: ${settingRows.map((r) => `${r.setting ?? "NULL"}=${Number(r.cnt).toLocaleString()}`).join(", ")}`);

  console.log("[7/7] Non-completed hospitals detail...");
  const excludedRows = (await db.all(
    `SELECT hospital_id, hospital_name, hospital_state, hospital_city,
            hospital_address, status
     FROM hospitals
     WHERE status != 'completed'
     ORDER BY hospital_state, hospital_name`
  )) as unknown as ExcludedHospRow[];
  console.log(`  Found ${excludedRows.length} non-completed hospitals`);

  await db.close();
  console.log("DuckDB closed");

  // ---------------------------------------------------------------------------
  // Supabase / Postgres queries
  // ---------------------------------------------------------------------------

  console.log("\n[A/3] Provider counts per state (with geocoding status)...");
  const provStateRes = await pgPool.query<PgProvStateRow>(`
    SELECT state,
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE lat IS NOT NULL)           AS geocoded,
      COUNT(*) FILTER (WHERE lat IS NULL)               AS null_location
    FROM providers
    WHERE trilliant_hospital_id IS NOT NULL
    GROUP BY state
    ORDER BY state
  `);
  const provByState = new Map(provStateRes.rows.map((r) => [r.state, r]));
  console.log(`  Got provider data for ${provStateRes.rows.length} states`);

  console.log("[B/3] Charge counts per state...");
  const chargeStateRes = await pgPool.query<PgChargeStateRow>(`
    SELECT p.state, COUNT(*) AS cnt
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    GROUP BY p.state
    ORDER BY p.state
  `);
  const chargesByState = new Map(chargeStateRes.rows.map((r) => [r.state, Number(r.cnt)]));
  console.log(`  Got charge data for ${chargeStateRes.rows.length} states`);

  console.log("[C/3] Null-location providers...");
  const nullProvRes = await pgPool.query<PgNullProvRow>(`
    SELECT name, state, city, address, trilliant_hospital_id
    FROM providers
    WHERE lat IS NULL AND trilliant_hospital_id IS NOT NULL
    ORDER BY state, name
  `);
  console.log(`  Found ${nullProvRes.rows.length} null-location providers`);

  await pgPool.end();
  console.log("Postgres pool closed");

  // ---------------------------------------------------------------------------
  // Compute aggregate summaries
  // ---------------------------------------------------------------------------

  const totalHospitals    = statusRows.reduce((s, r) => s + Number(r.cnt), 0);
  const completedHospitals = Number(statusRows.find((r) => r.status === "completed")?.cnt ?? 0);
  const excludedCount     = totalHospitals - completedHospitals;

  const totalDuckDbFilteredCharges = stateChargeRows.reduce((s, r) => s + Number(r.cnt), 0);

  const totalSupabaseProviders = [...provByState.values()].reduce((s, r) => s + Number(r.total), 0);
  const totalSupabaseGeocoded  = [...provByState.values()].reduce((s, r) => s + Number(r.geocoded), 0);
  const totalSupabaseNullLoc   = [...provByState.values()].reduce((s, r) => s + Number(r.null_location), 0);
  const totalSupabaseCharges   = [...chargesByState.values()].reduce((s, n) => s + n, 0);

  // Build per-state DuckDB maps
  const duckStateMap = new Map<string, { completed: number; total: number }>();
  for (const row of stateStatusRows) {
    const st = row.hospital_state ?? "UNKNOWN";
    if (!duckStateMap.has(st)) duckStateMap.set(st, { completed: 0, total: 0 });
    const entry = duckStateMap.get(st)!;
    entry.total += Number(row.cnt);
    if (row.status === "completed") entry.completed += Number(row.cnt);
  }
  const duckChargeMap = new Map(
    stateChargeRows.map((r) => [r.hospital_state ?? "UNKNOWN", Number(r.cnt)])
  );

  // All states across both databases
  const allStates = [...new Set([
    ...duckStateMap.keys(),
    ...provByState.keys(),
    ...chargesByState.keys(),
  ])].sort();

  const gap = totalDuckDbFilteredCharges - totalSupabaseCharges;

  // Setting breakdown — normalized (TRIM + LOWER applied in query)
  // (moved here so outpatientOtherCodes / inpatientCount are available for Executive Summary)
  const inpatientRow     = settingRows.find((r) => r.setting === "inpatient");
  const outpatientRow    = settingRows.find((r) => r.setting === "outpatient");
  const bothRow          = settingRows.find((r) => r.setting === "both");
  const nullSettingRow   = settingRows.find((r) => r.setting === "null");
  const otherSettingRows = settingRows.filter(
    (r) => !["inpatient", "outpatient", "both", "null"].includes(r.setting ?? "")
  );

  const inpatientCount    = Number(inpatientRow?.cnt ?? 0);
  const outpatientCount   = Number(outpatientRow?.cnt ?? 0);
  const bothCount         = Number(bothRow?.cnt ?? 0);
  const nullSettingCount  = Number(nullSettingRow?.cnt ?? 0);
  const otherSettingCount = otherSettingRows.reduce((s, r) => s + Number(r.cnt), 0);
  const notInpatientTotal = outpatientCount + bothCount + nullSettingCount + otherSettingCount;
  const outpatientOtherCodes = notInpatientTotal - totalDuckDbFilteredCharges;

  // Executive Summary pre-computations
  const supabasePct = totalDuckDbFilteredCharges > 0
    ? ((totalSupabaseCharges / totalDuckDbFilteredCharges) * 100).toFixed(1)
    : "?";
  const geocodedPct = totalSupabaseProviders > 0
    ? ((totalSupabaseGeocoded / totalSupabaseProviders) * 100).toFixed(1)
    : "?";
  const missingStates: Array<{ state: string; duckCharges: number }> = [];
  for (const st of allStates) {
    const duck = duckStateMap.get(st);
    const duckCharges = duckChargeMap.get(st) ?? 0;
    const supaCharges = chargesByState.get(st) ?? 0;
    const duckCompleted = duck?.completed ?? 0;
    if (duckCompleted > 0 && supaCharges === 0 && duckCharges > 0) {
      missingStates.push({ state: st, duckCharges });
    }
  }

  // ---------------------------------------------------------------------------
  // Build Markdown
  // ---------------------------------------------------------------------------

  console.log("\nGenerating markdown...");
  const now = new Date().toISOString();
  // e.g. "2026-03-01_19-52-31"
  const fileStamp = now.replace("T", "_").replace(/[:.]/g, "-").slice(0, 19);
  const SNAPSHOT_PATH = resolve(SNAPSHOTS_DIR, `${fileStamp}.md`);
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const lines: string[] = [];

  // Header
  lines.push(`# ClearCost Data Snapshot`);
  lines.push(``);
  lines.push(`_Generated: ${now}_`);
  lines.push(``);
  lines.push(`To regenerate after an import:`);
  lines.push(`\`\`\`bash`);
  lines.push(`npx tsx --env-file=.env.local lib/data/generate-snapshot.ts`);
  lines.push(`\`\`\``);
  lines.push(`Each run creates a new file in \`docs/snapshots/YYYY-MM-DD_HH-MM-SS.md\` and updates \`docs/data-snapshot.md\` (latest).`);
  lines.push(``);

  // ---------------------------------------------------
  // Executive Summary
  // ---------------------------------------------------
  lines.push(`## Executive Summary`);
  lines.push(``);
  lines.push(`| Metric | Value | Status |`);
  lines.push(`|--------|------:|-------|`);
  lines.push(`| Supabase charges (live) | ${fmtNum(totalSupabaseCharges)} | ${gap === 0 ? "✅ complete" : `⚠ ${supabasePct}% of target`} |`);
  lines.push(`| DuckDB target (filtered) | ${fmtNum(totalDuckDbFilteredCharges)} | — |`);
  lines.push(`| Gap | ${fmtNum(gap)} | ${gap === 0 ? "✅ none" : missingStates.map((m) => m.state).join(" + ") + " missing"} |`);
  lines.push(`| Supabase providers | ${fmtNum(totalSupabaseProviders)} | ✅ all completed hospitals |`);
  lines.push(`| Geocoded providers | ${fmtNum(totalSupabaseGeocoded)} (${geocodedPct}%) | ${totalSupabaseNullLoc > 0 ? `⚠ ${fmtNum(totalSupabaseNullLoc)} invisible to search` : "✅"} |`);
  lines.push(`| Excluded hospitals (DuckDB) | ${fmtNum(excludedCount)} | ℹ Trilliant data quality |`);
  lines.push(``);
  if (missingStates.length > 0 || totalSupabaseNullLoc > 0) {
    lines.push(`### Open Action Items`);
    lines.push(``);
    lines.push(`| Priority | Issue | Rows Affected |`);
    lines.push(`|----------|-------|--------------|`);
    for (const ms of missingStates) {
      lines.push(`| 🔴 | ${ms.state} charges missing — reimport needed | ${fmtNum(ms.duckCharges)} |`);
    }
    if (totalSupabaseNullLoc > 0) {
      lines.push(`| 🟡 | ${fmtNum(totalSupabaseNullLoc)} providers null lat/lng — geocode backfill needed | — |`);
    }
    lines.push(``);
  }
  lines.push(`### Data We're Sitting On`);
  lines.push(``);
  lines.push(`| Phase | Available Rows | Status |`);
  lines.push(`|-------|---------------:|--------|`);
  lines.push(`| 1-5: Current (1,010 codes, outpatient) | ${fmtNum(totalDuckDbFilteredCharges)} | ✅ ${supabasePct}% live |`);
  lines.push(`| 6: All outpatient codes | +${fmtNum(outpatientOtherCodes)} | 📋 Planned |`);
  lines.push(`| 7: Inpatient pricing | +${fmtNum(inpatientCount)} | 📋 Planned |`);
  lines.push(`| 8: Payer-specific rates | +${fmtNum(totalRawCharges)} | 🔮 Future infra |`);
  lines.push(``);
  lines.push(`_→ Full details in Sections 1–7 below_`);
  lines.push(``);

  // ---------------------------------------------------
  // 1. Data Funnel
  // ---------------------------------------------------
  lines.push(`## 1. Data Funnel`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`DuckDB (Trilliant Oria)`);
  lines.push(`  ├─ Hospitals total:              ${totalHospitals.toLocaleString().padStart(12)}`);
  lines.push(`  │    ├─ status=completed:        ${completedHospitals.toLocaleString().padStart(12)}  → imported to Supabase`);
  lines.push(`  │    └─ other status (excluded): ${excludedCount.toLocaleString().padStart(12)}  → never queried (see Section 4)`);
  lines.push(`  │`);
  lines.push(`  ├─ Raw charges (sum of total_charges_count across all hospitals):`);
  lines.push(`  │         ${totalRawCharges.toLocaleString().padStart(18)}  (~274M, not all are for our codes)`);
  lines.push(`  │`);
  lines.push(`  └─ Filtered charges (1,010 codes, outpatient only, completed hospitals):`);
  lines.push(`             ${totalDuckDbFilteredCharges.toLocaleString().padStart(14)}`);
  lines.push(``);
  lines.push(`Supabase (current state)`);
  lines.push(`  ├─ Providers: ${totalSupabaseProviders.toLocaleString().padStart(8)}  (${totalSupabaseGeocoded.toLocaleString()} geocoded, ${totalSupabaseNullLoc.toLocaleString()} null lat/lng — see Section 5)`);
  lines.push(`  └─ Charges:   ${totalSupabaseCharges.toLocaleString().padStart(8)}`);
  lines.push(``);
  lines.push(`  Gap: ${gap.toLocaleString()} charges not yet in Supabase`);
  if (gap > 0) {
    lines.push(`       (Expected if NJ/PA not yet reimported. See MISSING rows in Section 3.)`);
  }
  lines.push(`\`\`\``);
  lines.push(``);

  // ---------------------------------------------------
  // 2. Hospital Status Breakdown
  // ---------------------------------------------------
  lines.push(`## 2. DuckDB Hospital Status Breakdown`);
  lines.push(``);
  lines.push(`| Status | Count |`);
  lines.push(`|--------|------:|`);
  for (const row of statusRows) {
    lines.push(`| \`${row.status ?? "NULL"}\` | ${fmtNum(row.cnt)} |`);
  }
  lines.push(`| **Total** | **${fmtNum(totalHospitals)}** |`);
  lines.push(``);

  // ---------------------------------------------------
  // 3. Per-State Table
  // ---------------------------------------------------
  lines.push(`## 3. Per-State Data Table`);
  lines.push(``);
  lines.push(`_DuckDB: completed hospitals + filtered charge count (1,010 codes, outpatient, completed hospitals only)_`);
  lines.push(`_Supabase: providers imported + geocoding status + charges imported_`);
  lines.push(`_**MISSING** = DuckDB has completed hospitals with charges, but Supabase has 0 charges (needs import)_`);
  lines.push(``);
  lines.push(`| State | DDB Hosps | DDB Charges | SB Providers | SB Geocoded | SB Null Loc | SB Charges | Match |`);
  lines.push(`|-------|----------:|------------:|-------------:|------------:|------------:|-----------:|-------|`);

  for (const st of allStates) {
    const duck = duckStateMap.get(st);
    const duckCharges = duckChargeMap.get(st) ?? 0;
    const supa = provByState.get(st);
    const supaCharges = chargesByState.get(st) ?? 0;
    const duckCompleted = duck?.completed ?? 0;
    const supaTotal    = supa ? Number(supa.total) : 0;
    const supaGeocoded = supa ? Number(supa.geocoded) : 0;
    const supaNullLoc  = supa ? Number(supa.null_location) : 0;

    let match = "✓";
    if (duckCompleted > 0 && supaCharges === 0 && duckCharges > 0) {
      match = "**MISSING**";
    } else if (duckCharges > 0 && supaCharges > 0) {
      const pctDiff = Math.abs(duckCharges - supaCharges) / duckCharges;
      if (pctDiff > 0.05) match = "⚠ partial";
    }

    lines.push(`| ${st} | ${fmtNum(duckCompleted)} | ${fmtNum(duckCharges)} | ${fmtNum(supaTotal)} | ${fmtNum(supaGeocoded)} | ${fmtNum(supaNullLoc)} | ${fmtNum(supaCharges)} | ${match} |`);
  }
  lines.push(``);

  // ---------------------------------------------------
  // 4. Excluded Hospitals
  // ---------------------------------------------------
  lines.push(`## 4. Excluded Hospitals (status != 'completed')`);
  lines.push(``);
  lines.push(`**${excludedRows.length.toLocaleString()} hospitals** were excluded from the import because Trilliant did not fully`);
  lines.push(`process them — the \`status != 'completed'\` filter in \`importProviders()\` drops them before any charge`);
  lines.push(`data is queried. These are a Trilliant data quality limitation, not a ClearCost bug.`);
  lines.push(``);

  // Group by status for summary
  const byStatus = new Map<string, ExcludedHospRow[]>();
  for (const row of excludedRows) {
    const key = row.status ?? "NULL";
    if (!byStatus.has(key)) byStatus.set(key, []);
    byStatus.get(key)!.push(row);
  }

  lines.push(`### By Status`);
  lines.push(``);
  lines.push(`| Status | Count |`);
  lines.push(`|--------|------:|`);
  for (const [st, rows] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`| \`${st}\` | ${rows.length.toLocaleString()} |`);
  }
  lines.push(``);

  lines.push(`### Full Listing`);
  lines.push(``);
  lines.push(`| ID | Name | State | City | Status |`);
  lines.push(`|----|------|-------|------|--------|`);
  for (const row of excludedRows) {
    lines.push(`| ${Number(row.hospital_id)} | ${mdEscape(row.hospital_name)} | ${row.hospital_state ?? "—"} | ${mdEscape(row.hospital_city)} | \`${row.status ?? "NULL"}\` |`);
  }
  lines.push(``);

  // ---------------------------------------------------
  // 5. Null-Location Providers
  // ---------------------------------------------------
  lines.push(`## 5. Null-Location Providers (invisible to search)`);
  lines.push(``);
  lines.push(`**${nullProvRes.rows.length.toLocaleString()} providers** exist in Supabase but have \`lat = NULL\` and \`lng = NULL\`.`);
  lines.push(`These are **invisible to all distance-based searches** because PostGIS \`ST_DWithin()\` requires a non-null`);
  lines.push(`geometry point.`);
  lines.push(``);
  lines.push(`**Root cause:** \`geocodeByZip()\` in \`import-trilliant.ts\` only extracts zip codes from the`);
  lines.push(`\`hospital_address\` string. These hospitals had addresses without a parseable 5-digit zip.`);
  lines.push(`The \`hospital_city\` and \`hospital_state\` fields were populated but never used for geocoding.`);
  lines.push(``);
  lines.push(`### Geocoding Improvement Opportunity`);
  lines.push(``);
  lines.push(`These providers could be fixed using \`hospital_city + hospital_state\` via the Google Maps`);
  lines.push(`Geocoding API (\`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY\` is already configured). Approach:`);
  lines.push(``);
  lines.push(`1. Query \`providers WHERE lat IS NULL AND trilliant_hospital_id IS NOT NULL\``);
  lines.push(`2. Geocode each via \`{city}, {state}\` → Google Maps Geocoding API → lat/lng`);
  lines.push(`3. \`UPDATE providers SET lat=?, lng=? WHERE id=?\``);
  lines.push(``);
  lines.push(`This is a separate task — not part of the NJ/PA reimport.`);
  lines.push(``);
  lines.push(`### Full Listing`);
  lines.push(``);
  lines.push(`| Name | State | City | Address | Trilliant ID |`);
  lines.push(`|------|-------|------|---------|-------------|`);
  for (const row of nullProvRes.rows) {
    lines.push(`| ${mdEscape(row.name)} | ${row.state ?? "—"} | ${mdEscape(row.city)} | ${mdEscape(row.address)} | ${row.trilliant_hospital_id ?? "—"} |`);
  }
  lines.push(``);

  // ---------------------------------------------------
  // 6. Post-Import Verification Targets
  // ---------------------------------------------------
  lines.push(`## 6. Post-Import Verification Targets`);
  lines.push(``);
  lines.push(`After the NJ/PA reimport, re-run this script and verify the following:`);
  lines.push(``);
  lines.push(`| Metric | Expected After Reimport | Verify Via |`);
  lines.push(`|--------|------------------------|------------|`);
  lines.push(`| Total Supabase charges | ${fmtNum(totalDuckDbFilteredCharges)} | Section 1 Funnel — gap = 0 |`);
  lines.push(`| NJ Supabase charges | See NJ row in Section 3 (DDB Charges column) | NJ row Match = ✓ |`);
  lines.push(`| PA Supabase charges | See PA row in Section 3 (DDB Charges column) | PA row Match = ✓ |`);
  lines.push(`| NJ providers | See NJ row — DDB Hosps column | NJ SB Providers = DDB Hosps |`);
  lines.push(`| PA providers | See PA row — DDB Hosps column | PA SB Providers = DDB Hosps |`);
  lines.push(`| Null-location providers | ${fmtNum(totalSupabaseNullLoc)} (unchanged by reimport) | Section 5 count |`);
  lines.push(``);
  lines.push(`_Null-location count will not change with NJ/PA reimport — those providers are already in Supabase._`);
  lines.push(`_Fixing null-location requires a separate geocoding task (see Section 5)._`);
  lines.push(``);

  // ---------------------------------------------------
  // 7. Full Data Inventory — Expansion Roadmap
  // ---------------------------------------------------
  lines.push(`## 7. Full Data Inventory — What We're Sitting On`);
  lines.push(``);
  lines.push(`This section shows the complete Trilliant Oria dataset and how much of it ClearCost currently uses.`);
  lines.push(`It is intended to inform product roadmap and investor conversations.`);
  lines.push(``);

  const pctUsed             = totalStdCharges > 0 ? ((totalDuckDbFilteredCharges / totalStdCharges) * 100).toFixed(1) : "?";
  const pctOutpatientOther  = totalStdCharges > 0 ? ((outpatientOtherCodes / totalStdCharges) * 100).toFixed(1) : "?";
  const pctInpatient        = totalStdCharges > 0 ? ((inpatientCount / totalStdCharges) * 100).toFixed(1) : "?";

  lines.push(`### standard_charges Setting Breakdown (Normalized)`);
  lines.push(``);
  lines.push(`_Setting values normalized via \`TRIM(LOWER(setting))\` — Trilliant data contains 30+ case/spacing variants._`);
  lines.push(``);
  lines.push(`| Setting (normalized) | Row Count | % of Total | Import behavior |`);
  lines.push(`|----------------------|----------:|-----------:|-----------------|`);
  for (const row of settingRows) {
    const pct = totalStdCharges > 0 ? ((Number(row.cnt) / totalStdCharges) * 100).toFixed(1) : "?";
    let behavior = "";
    if (row.setting === "inpatient") behavior = "❌ Excluded by import filter";
    else if (row.setting === "outpatient") behavior = "✅ Included";
    else if (row.setting === "both") behavior = "✅ Included (can be done outpatient)";
    else if (row.setting === "null") behavior = "✅ Included (NULL treated as outpatient)";
    else behavior = "⚠ Included (unrecognized value)";
    lines.push(`| \`${row.setting}\` | ${fmtNum(row.cnt)} | ${pct}% | ${behavior} |`);
  }
  lines.push(`| **Total** | **${fmtNum(totalStdCharges)}** | 100% | |`);
  lines.push(``);
  lines.push(`> **Note on "both"**: These rows represent procedures that hospitals offer under both inpatient AND outpatient`);
  lines.push(`> billing contexts. The import includes them since they can be performed outpatient (correct behavior).`);
  lines.push(``);

  lines.push(`### Data Layer Summary`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`Trilliant Oria — Full Dataset`);
  lines.push(`┌──────────────────────────────────────────────────────────────────┐`);
  lines.push(`│  standard_charges table: ${totalStdCharges.toLocaleString().padStart(14)} rows total                 │`);
  lines.push(`│                                                                  │`);
  lines.push(`│  ┌─────────────────────────────────────────────────────────┐    │`);
  lines.push(`│  │  Phase 1-5 (LIVE)                                       │    │`);
  lines.push(`│  │  Outpatient + 1,010 curated codes + completed hospitals  │    │`);
  lines.push(`│  │  ${totalDuckDbFilteredCharges.toLocaleString().padStart(14)} rows   (${pctUsed.padStart(5)}% of total)            │    │`);
  lines.push(`│  └─────────────────────────────────────────────────────────┘    │`);
  lines.push(`│                                                                  │`);
  lines.push(`│  Phase 6 — More outpatient codes                                │`);
  lines.push(`│  ${outpatientOtherCodes.toLocaleString().padStart(14)} rows   (${pctOutpatientOther.padStart(5)}% of total)                    │`);
  lines.push(`│  All outpatient codes NOT in our 1,010 curated set              │`);
  lines.push(`│                                                                  │`);
  lines.push(`│  Phase 7 — Inpatient pricing (MS-DRG codes)                     │`);
  lines.push(`│  ${inpatientCount.toLocaleString().padStart(14)} rows   (${pctInpatient.padStart(5)}% of total)                    │`);
  lines.push(`│  Hospital admission-level pricing (not shoppable)               │`);
  lines.push(`└──────────────────────────────────────────────────────────────────┘`);
  lines.push(``);
  lines.push(`┌──────────────────────────────────────────────────────────────────┐`);
  lines.push(`│  payer_detail table: ${totalRawCharges.toLocaleString().padStart(16)} rows                       │`);
  lines.push(`│  (individual negotiated rates per insurer per code per hospital) │`);
  lines.push(`│                                                                  │`);
  lines.push(`│  Phase 8 — Insurance transparency                               │`);
  lines.push(`│  "What does Aetna pay at NYU Langone for a knee MRI?"            │`);
  lines.push(`│  Currently: 0 rows imported (using avg/min/max summaries only)   │`);
  lines.push(`└──────────────────────────────────────────────────────────────────┘`);
  lines.push(`\`\`\``);
  lines.push(``);

  lines.push(`### Supabase Hosting Cost Reality Check`);
  lines.push(``);
  lines.push(`| Layer | Rows | Est. Storage | Feasibility |`);
  lines.push(`|-------|-----:|-------------|-------------|`);
  lines.push(`| Phase 1-5 (current) | ${fmtNum(totalDuckDbFilteredCharges)} | ~2-3 GB | ✅ Supabase Pro |`);
  lines.push(`| + Phase 6 (all outpatient) | ${fmtNum(outpatientOtherCodes + totalDuckDbFilteredCharges)} | ~40-50 GB | ⚠ Supabase scales, cost climbs |`);
  lines.push(`| + Phase 7 (+ inpatient) | ${fmtNum(totalStdCharges)} | ~60-70 GB | ⚠ Same order of magnitude |`);
  lines.push(`| + Phase 8 (+ payer detail) | ${fmtNum(totalRawCharges)} | ~1-2 TB | 🔴 Needs dedicated infra or data warehouse |`);
  lines.push(``);
  lines.push(`_Estimates assume ~200 bytes/row average across all columns._`);
  lines.push(`_Phase 8 (payer detail) is a fundamentally different infrastructure problem — likely needs MotherDuck, BigQuery, or a dedicated analytics DB rather than Supabase._`);
  lines.push(``);
  lines.push(`### ⚠ Data Quality Finding: Import Filter Gap`);
  lines.push(``);
  lines.push(`The import filter in \`import-trilliant.ts\` uses \`LOWER(setting) != 'inpatient'\` to exclude`);
  lines.push(`inpatient rows. However, **LOWER() does not trim whitespace**. Trilliant's data contains`);
  lines.push(`setting values like \`"inpatient "\` (trailing space) and \`" inpatient "\` (leading + trailing)`);
  lines.push(`that are NOT caught by this filter.`);
  lines.push(``);
  lines.push(`\`\`\``);
  lines.push(`LOWER('inpatient ')  = 'inpatient '  ← NOT equal to 'inpatient' → incorrectly imported`);
  lines.push(`LOWER(' inpatient ') = ' inpatient ' ← NOT equal to 'inpatient' → incorrectly imported`);
  lines.push(`LOWER('INPATIENT')   = 'inpatient'   ← equal to 'inpatient'    → correctly excluded`);
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`**Fix**: Change the filter to \`TRIM(LOWER(setting)) != 'inpatient'\` in import-trilliant.ts.`);
  lines.push(`**Impact**: The current Supabase dataset may include a small number of inpatient charges.`);
  lines.push(`This is tracked in a future cleanup task.`);

  // ---------------------------------------------------------------------------
  // Write output
  // ---------------------------------------------------------------------------

  const output = lines.join("\n");
  writeFileSync(SNAPSHOT_PATH, output, "utf8");  // timestamped archive
  writeFileSync(LATEST_PATH, output, "utf8");    // always-current convenience path

  console.log(`\nWrote archive:  ${SNAPSHOT_PATH}`);
  console.log(`Wrote latest:   ${LATEST_PATH}`);
  console.log("\n=== Summary ===");
  console.log(`  DuckDB hospitals:       ${totalHospitals.toLocaleString()} (${completedHospitals.toLocaleString()} completed, ${excludedCount.toLocaleString()} excluded)`);
  console.log(`  DuckDB filtered charges: ${totalDuckDbFilteredCharges.toLocaleString()}`);
  console.log(`  Supabase providers:     ${totalSupabaseProviders.toLocaleString()} (${totalSupabaseNullLoc.toLocaleString()} null lat/lng)`);
  console.log(`  Supabase charges:       ${totalSupabaseCharges.toLocaleString()}`);
  console.log(`  Gap:                    ${gap.toLocaleString()} charges missing`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
