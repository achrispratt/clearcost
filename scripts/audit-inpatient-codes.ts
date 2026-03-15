/**
 * audit-inpatient-codes.ts — ClearCost Inpatient Code Audit
 *
 * Queries DuckDB for the setting distribution of every code in final-codes.json,
 * classifies each as REMOVE/REVIEW/LOW_DATA/KEEP, and outputs:
 *   1. Console report (grouped by classification tier)
 *   2. lib/data/inpatient-audit.json (full machine-readable audit)
 *   3. docs/inpatient-codes-removed.md (human-readable methodology + removed codes)
 *
 * Run with:
 *   npx tsx scripts/audit-inpatient-codes.ts
 *
 * Expects CWD = project root (clearcost/).
 * DuckDB data at lib/data/mrf_lake/mrf_lake.duckdb + parquet/.
 */

import { Database } from "duckdb-async";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = resolve(__dirname, "..");
const DB_PATH = resolve(PROJECT_ROOT, "lib/data/mrf_lake/mrf_lake.duckdb");
const CODES_PATH = resolve(PROJECT_ROOT, "lib/data/final-codes.json");

// Resolve output paths BEFORE chdir (or they resolve relative to mrf_lake/)
const AUDIT_JSON_PATH = resolve(PROJECT_ROOT, "lib/data/inpatient-audit.json");
const REMOVED_MD_PATH = resolve(
  PROJECT_ROOT,
  "docs/inpatient-codes-removed.md"
);

// ---------------------------------------------------------------------------
// Known inpatient families — force REMOVE regardless of data
// ---------------------------------------------------------------------------

const KNOWN_INPATIENT_FAMILIES: Record<string, string> = {
  "99221": "Initial Hospital Care (low complexity)",
  "99222": "Initial Hospital Care (moderate complexity)",
  "99223": "Initial Hospital Care (high complexity)",
  "99231": "Subsequent Hospital Care (low complexity)",
  "99232": "Subsequent Hospital Care (moderate complexity)",
  "99233": "Subsequent Hospital Care (high complexity)",
  "99238": "Hospital Discharge Day Management (≤30 min)",
  "99239": "Hospital Discharge Day Management (>30 min)",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeAuditRow {
  code: string;
  typical_description: string | null;
  total_rows: bigint;
  inpatient_count: bigint;
  outpatient_count: bigint;
  both_count: bigint;
  null_setting_count: bigint;
  cash_null_count: bigint;
  has_ms_drg_count: bigint;
}

interface MsDrgRow {
  ms_drg: string;
  cnt: bigint;
}

type Classification = "REMOVE" | "REVIEW" | "LOW_DATA" | "KEEP";

interface AuditEntry {
  code: string;
  description: string;
  classification: Classification;
  reason: string;
  totalRows: number;
  inpatientCount: number;
  outpatientCount: number;
  bothCount: number;
  nullSettingCount: number;
  cashNullCount: number;
  hasMsDrgCount: number;
  inpatientPct: number;
  cashNullPct: number;
}

// ---------------------------------------------------------------------------
// Classification logic
// ---------------------------------------------------------------------------

function classify(
  row: CodeAuditRow,
  msDrgCodes: Set<string>
): { classification: Classification; reason: string } {
  const code = row.code;
  const total = Number(row.total_rows);
  const inpatient = Number(row.inpatient_count);
  const cashNull = Number(row.cash_null_count);
  const hasMsDrg = Number(row.has_ms_drg_count);

  const inpatientPct = total > 0 ? (inpatient / total) * 100 : 0;
  const cashNullPct = total > 0 ? (cashNull / total) * 100 : 0;

  // Priority 1: Known inpatient families
  if (code in KNOWN_INPATIENT_FAMILIES) {
    return {
      classification: "REMOVE",
      reason: `Known inpatient: ${KNOWN_INPATIENT_FAMILIES[code]}`,
    };
  }

  // Priority 2: >90% inpatient
  if (inpatientPct > 90) {
    return {
      classification: "REMOVE",
      reason: `${inpatientPct.toFixed(1)}% inpatient`,
    };
  }

  // Priority 3: Has MS-DRG AND >50% inpatient
  if ((hasMsDrg > 0 || msDrgCodes.has(code)) && inpatientPct > 50) {
    return {
      classification: "REMOVE",
      reason: `MS-DRG associated + ${inpatientPct.toFixed(1)}% inpatient`,
    };
  }

  // Priority 4: 100% cash null AND >50% inpatient
  if (cashNullPct === 100 && inpatientPct > 50) {
    return {
      classification: "REMOVE",
      reason: `100% cash-null + ${inpatientPct.toFixed(1)}% inpatient`,
    };
  }

  // Priority 5: >70% inpatient → REVIEW
  if (inpatientPct > 70) {
    return {
      classification: "REVIEW",
      reason: `${inpatientPct.toFixed(1)}% inpatient (borderline)`,
    };
  }

  // Priority 6: >95% cash null with sufficient data → REVIEW
  if (cashNullPct > 95 && total > 100) {
    return {
      classification: "REVIEW",
      reason: `${cashNullPct.toFixed(1)}% cash-null (${total} rows)`,
    };
  }

  // Priority 7: Too little data to judge
  if (total < 10) {
    return {
      classification: "LOW_DATA",
      reason: `Only ${total} rows — insufficient data`,
    };
  }

  return { classification: "KEEP", reason: "Primarily outpatient/both" };
}

// ---------------------------------------------------------------------------
// Console output helpers
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

function printTable(entries: AuditEntry[], title: string) {
  console.log(`\n${"═".repeat(110)}`);
  console.log(`  ${title} (${entries.length} codes)`);
  console.log(`${"═".repeat(110)}`);
  console.log(
    `  ${pad("Code", 7)} ${pad("Description", 45)} ${padLeft("Total", 8)} ${padLeft("Inpt%", 7)} ${padLeft("Outpt%", 7)} ${padLeft("Cash∅%", 7)} Reason`
  );
  console.log(`  ${"-".repeat(106)}`);
  for (const e of entries) {
    const desc = (e.description || "—").slice(0, 43);
    console.log(
      `  ${pad(e.code, 7)} ${pad(desc, 45)} ${padLeft(e.totalRows.toLocaleString(), 8)} ${padLeft(e.inpatientPct.toFixed(1) + "%", 7)} ${padLeft(
        (e.totalRows > 0
          ? ((e.outpatientCount / e.totalRows) * 100).toFixed(1)
          : "0.0") + "%",
        7
      )} ${padLeft(e.cashNullPct.toFixed(1) + "%", 7)} ${e.reason}`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const codes: string[] = JSON.parse(readFileSync(CODES_PATH, "utf8"));
  console.log(`Loaded ${codes.length} codes from final-codes.json`);

  // Must chdir for DuckDB relative parquet paths
  const dbDir = dirname(DB_PATH);
  process.chdir(dbDir);
  console.log(`Changed CWD to ${dbDir}`);

  console.log("Opening DuckDB (read-only)...");
  const db = await Database.create(DB_PATH, { access_mode: "READ_ONLY" });
  await db.run(`SET memory_limit = '8GB'`);
  await db.run(`SET threads = 4`);
  console.log("DuckDB ready (memory_limit=8GB, threads=4)");

  // Build SQL IN list
  const codeList = codes.map((c) => `'${c}'`).join(",");

  // ---------------------------------------------------------------------------
  // Query 1: Setting distribution per code (single Parquet scan)
  // ---------------------------------------------------------------------------
  console.log("\n[1/2] Querying setting distribution for all codes...");
  console.log("  ⚠  Scanning ~81GB Parquet — expect 2-5 minutes...");
  const startQ1 = Date.now();

  const auditRows = (await db.all(`
    WITH matched AS (
      SELECT
        COALESCE(
          CASE WHEN cpt IN (${codeList}) THEN cpt ELSE NULL END,
          CASE WHEN hcpcs IN (${codeList}) THEN hcpcs ELSE NULL END
        ) AS code,
        TRIM(LOWER(COALESCE(setting, 'null'))) AS norm_setting,
        discounted_cash, description, ms_drg
      FROM standard_charges
      WHERE cpt IN (${codeList}) OR hcpcs IN (${codeList}) OR ms_drg IN (${codeList})
    )
    SELECT
      code,
      MODE(description) AS typical_description,
      COUNT(*) AS total_rows,
      COUNT(*) FILTER (WHERE norm_setting = 'inpatient') AS inpatient_count,
      COUNT(*) FILTER (WHERE norm_setting = 'outpatient') AS outpatient_count,
      COUNT(*) FILTER (WHERE norm_setting = 'both') AS both_count,
      COUNT(*) FILTER (WHERE norm_setting = 'null') AS null_setting_count,
      COUNT(*) FILTER (WHERE discounted_cash IS NULL) AS cash_null_count,
      COUNT(*) FILTER (WHERE ms_drg IS NOT NULL AND ms_drg != '') AS has_ms_drg_count
    FROM matched
    GROUP BY code
    ORDER BY code
  `)) as unknown as CodeAuditRow[];

  const q1Elapsed = ((Date.now() - startQ1) / 1000).toFixed(1);
  console.log(`  Got data for ${auditRows.length} codes (${q1Elapsed}s)`);

  // ---------------------------------------------------------------------------
  // Query 2: Check for MS-DRG codes in our list
  // ---------------------------------------------------------------------------
  console.log("\n[2/2] Checking for MS-DRG matches...");
  const startQ2 = Date.now();

  const msDrgRows = (await db.all(`
    SELECT ms_drg, COUNT(*) AS cnt
    FROM standard_charges
    WHERE ms_drg IN (${codeList})
      AND (cpt IS NULL OR cpt = '') AND (hcpcs IS NULL OR hcpcs = '')
    GROUP BY ms_drg
  `)) as unknown as MsDrgRow[];

  const q2Elapsed = ((Date.now() - startQ2) / 1000).toFixed(1);
  console.log(
    `  Found ${msDrgRows.length} codes used as MS-DRG (${q2Elapsed}s)`
  );

  const msDrgCodes = new Set(msDrgRows.map((r) => r.ms_drg));

  await db.close();
  console.log("DuckDB closed");

  // ---------------------------------------------------------------------------
  // Classify every code
  // ---------------------------------------------------------------------------

  const auditMap = new Map(auditRows.map((r) => [r.code, r]));
  const entries: AuditEntry[] = [];

  for (const code of codes) {
    const row = auditMap.get(code);
    if (!row) {
      entries.push({
        code,
        description: "—",
        classification: "LOW_DATA",
        reason: "No rows found in DuckDB",
        totalRows: 0,
        inpatientCount: 0,
        outpatientCount: 0,
        bothCount: 0,
        nullSettingCount: 0,
        cashNullCount: 0,
        hasMsDrgCount: 0,
        inpatientPct: 0,
        cashNullPct: 0,
      });
      continue;
    }

    const total = Number(row.total_rows);
    const inpatient = Number(row.inpatient_count);
    const cashNull = Number(row.cash_null_count);

    const { classification, reason } = classify(row, msDrgCodes);

    entries.push({
      code,
      description: row.typical_description ?? "—",
      classification,
      reason,
      totalRows: total,
      inpatientCount: inpatient,
      outpatientCount: Number(row.outpatient_count),
      bothCount: Number(row.both_count),
      nullSettingCount: Number(row.null_setting_count),
      cashNullCount: cashNull,
      hasMsDrgCount: Number(row.has_ms_drg_count),
      inpatientPct: total > 0 ? (inpatient / total) * 100 : 0,
      cashNullPct: total > 0 ? (cashNull / total) * 100 : 0,
    });
  }

  // Group by classification
  const remove = entries.filter((e) => e.classification === "REMOVE");
  const review = entries.filter((e) => e.classification === "REVIEW");
  const lowData = entries.filter((e) => e.classification === "LOW_DATA");
  const keep = entries.filter((e) => e.classification === "KEEP");

  // ---------------------------------------------------------------------------
  // Console output
  // ---------------------------------------------------------------------------

  console.log("\n" + "▓".repeat(110));
  console.log("  INPATIENT CODE AUDIT RESULTS");
  console.log("▓".repeat(110));

  printTable(
    remove,
    "REMOVE — Inpatient-only codes to remove from curated list"
  );
  printTable(review, "REVIEW — Borderline codes needing manual review");

  if (lowData.length > 0) {
    console.log(`\n${"═".repeat(110)}`);
    console.log(
      `  LOW_DATA — ${lowData.length} codes with <10 rows (keeping by default)`
    );
    console.log(`${"═".repeat(110)}`);
    for (const e of lowData) {
      console.log(
        `    ${e.code}  ${e.description.slice(0, 50)}  (${e.totalRows} rows)`
      );
    }
  }

  console.log(`\n${"═".repeat(110)}`);
  console.log(
    `  KEEP — ${keep.length} codes are primarily outpatient (suppressed)`
  );
  console.log(`${"═".repeat(110)}`);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Summary:`);
  console.log(`    REMOVE:   ${remove.length} codes`);
  console.log(`    REVIEW:   ${review.length} codes`);
  console.log(`    LOW_DATA: ${lowData.length} codes`);
  console.log(`    KEEP:     ${keep.length} codes`);
  console.log(`    Total:    ${entries.length} codes`);
  console.log(`${"─".repeat(60)}`);

  // ---------------------------------------------------------------------------
  // Write inpatient-audit.json
  // ---------------------------------------------------------------------------

  const auditJson = {
    generated: new Date().toISOString(),
    totalCodes: entries.length,
    summary: {
      remove: remove.length,
      review: review.length,
      lowData: lowData.length,
      keep: keep.length,
    },
    codes: entries,
  };

  writeFileSync(AUDIT_JSON_PATH, JSON.stringify(auditJson, null, 2), "utf8");
  console.log(`\nWrote ${AUDIT_JSON_PATH}`);

  // ---------------------------------------------------------------------------
  // Write docs/inpatient-codes-removed.md
  // ---------------------------------------------------------------------------

  const md: string[] = [];
  md.push(`# Inpatient Codes Removed from Curated List`);
  md.push(``);
  md.push(`_Generated: ${new Date().toISOString()}_`);
  md.push(`_Closes [#28](https://github.com/achrispratt/clearcost/issues/28)_`);
  md.push(``);
  md.push(`## Methodology`);
  md.push(``);
  md.push(
    `Queried the Trilliant Oria DuckDB warehouse (~81GB Parquet) for the setting distribution`
  );
  md.push(
    `of all ${codes.length.toLocaleString()} curated codes in \`final-codes.json\`. Each code was classified as:`
  );
  md.push(``);
  md.push(`| Classification | Rule | Action |`);
  md.push(`|---------------|------|--------|`);
  md.push(
    `| **REMOVE** | Known inpatient family, OR >90% inpatient, OR MS-DRG + >50% inpatient, OR 100% cash-null + >50% inpatient | Removed from final-codes.json |`
  );
  md.push(
    `| **REVIEW** | >70% inpatient, OR >95% cash-null (100+ rows) | Manually reviewed, then removed or kept |`
  );
  md.push(
    `| **LOW_DATA** | <10 rows in warehouse | Kept (insufficient data to judge) |`
  );
  md.push(`| **KEEP** | Everything else | No change |`);
  md.push(``);
  md.push(`## Root Cause`);
  md.push(``);
  md.push(
    `The import filter used \`LOWER(setting) != 'inpatient'\` which missed values like \`'InPatient '\``
  );
  md.push(
    `(trailing space). Fixed in this PR by adding \`TRIM()\` to both \`import-trilliant.ts\` and \`generate-snapshot.ts\`.`
  );
  md.push(``);
  md.push(`## Codes Removed (${remove.length})`);
  md.push(``);
  md.push(`| Code | Description | Total Rows | Inpatient % | Reason |`);
  md.push(`|------|-------------|----------:|------------:|--------|`);
  for (const e of remove) {
    const desc = (e.description || "—")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, " ");
    md.push(
      `| ${e.code} | ${desc} | ${e.totalRows.toLocaleString()} | ${e.inpatientPct.toFixed(1)}% | ${e.reason} |`
    );
  }
  md.push(``);

  if (review.length > 0) {
    md.push(`## Codes Reviewed (${review.length})`);
    md.push(``);
    md.push(
      `These codes were flagged for manual review. Disposition noted in the Reason column.`
    );
    md.push(``);
    md.push(`| Code | Description | Total Rows | Inpatient % | Reason |`);
    md.push(`|------|-------------|----------:|------------:|--------|`);
    for (const e of review) {
      const desc = (e.description || "—")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ");
      md.push(
        `| ${e.code} | ${desc} | ${e.totalRows.toLocaleString()} | ${e.inpatientPct.toFixed(1)}% | ${e.reason} |`
      );
    }
    md.push(``);
  }

  md.push(`## Impact`);
  md.push(``);
  md.push(
    `- **Codes removed**: ${remove.length} (from ${entries.length} → ${entries.length - remove.length})`
  );
  md.push(
    `- **Database**: No changes needed — only affects curated code list and future imports`
  );
  md.push(
    `- **Search quality**: Consumers will no longer see inpatient-only procedures in results`
  );
  md.push(``);

  writeFileSync(REMOVED_MD_PATH, md.join("\n"), "utf8");
  console.log(`Wrote ${REMOVED_MD_PATH}`);

  console.log(
    "\nDone! Review the REMOVE and REVIEW lists, then edit final-codes.json."
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
