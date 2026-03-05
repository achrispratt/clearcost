/**
 * Comprehensive provider geography audit.
 *
 * Cross-validates provider state/zip/coordinates against the `zipcodes` npm
 * reference data by pushing it into Supabase as a temp table and running
 * all checks as SQL JOINs — bringing computation to the data.
 *
 * All queries run in a SINGLE psql session so the temp table persists
 * across checks. Section markers (\echo) delimit query results in output.
 *
 * Checks:
 *   1. ZIP↔state mismatch (CRITICAL)
 *   2. Invalid/unresolvable ZIPs (WARNING)
 *   3. Coordinate drift from ZIP centroid (WARNING/CRITICAL)
 *   4. Missing geographic data (CRITICAL)
 *   5. City↔state mismatch (INFO)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/audit-provider-geography.ts
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error — zipcodes package has no type declarations
import zipcodes from "zipcodes";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PSQL_BIN = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const DB_URL = process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.error("Missing SUPABASE_DB_URL in environment");
  process.exit(1);
}

const DRIFT_WARNING_MILES = 25;
const DRIFT_CRITICAL_MILES = 75;
const SECTION_MARKER = "===SECTION===";

type Severity = "CRITICAL" | "WARNING" | "INFO";

interface AuditResult {
  check: string;
  severity: Severity;
  count: number;
  rows: Record<string, string>[];
}

// ---------------------------------------------------------------------------
// Step 1: Export zipcodes reference to CSV
// ---------------------------------------------------------------------------

function exportZipReferenceCsv(): string {
  const csvPath = join(tmpdir(), `clearcost-zip-ref-${Date.now()}.csv`);
  const lines: string[] = ["zip,state,city,lat,lng"];

  const allCodes = (
    zipcodes as unknown as {
      codes: Record<
        string,
        {
          zip: string;
          state: string;
          city: string;
          latitude: number;
          longitude: number;
        }
      >;
    }
  ).codes;

  for (const [, info] of Object.entries(allCodes)) {
    if (!info || !info.state) continue;
    const city = info.city ? `"${info.city.replace(/"/g, '""')}"` : "";
    const lat = info.latitude != null ? String(info.latitude) : "";
    const lng = info.longitude != null ? String(info.longitude) : "";
    lines.push(`${info.zip},${info.state},${city},${lat},${lng}`);
  }

  writeFileSync(csvPath, lines.join("\n") + "\n", "utf-8");
  console.log(`[zip-ref] Exported ${lines.length - 1} ZIP codes to ${csvPath}`);
  return csvPath;
}

// ---------------------------------------------------------------------------
// Build the single psql script
// ---------------------------------------------------------------------------

function buildAuditScript(csvPath: string): string {
  return `
-- Setup: create temp table and load ZIP reference
CREATE TEMP TABLE _zip_ref (
  zip text PRIMARY KEY,
  state text NOT NULL,
  city text,
  lat double precision,
  lng double precision
);
\\COPY _zip_ref FROM '${csvPath}' CSV HEADER

\\echo ${SECTION_MARKER}:setup
SELECT count(*) FROM _zip_ref;

-- Check 1: ZIP↔state mismatch
\\echo ${SECTION_MARKER}:check1
SELECT p.id, p.name, p.state AS stored_state, z.state AS zip_state, p.zip, p.address
FROM providers p
JOIN _zip_ref z ON z.zip = p.zip
WHERE p.state IS DISTINCT FROM z.state;

-- Check 2: Invalid/unresolvable ZIPs
\\echo ${SECTION_MARKER}:check2
SELECT p.id, p.name, p.zip, p.state, p.address
FROM providers p
LEFT JOIN _zip_ref z ON z.zip = p.zip
WHERE p.zip IS NOT NULL AND z.zip IS NULL;

-- Check 3: Coordinate drift from ZIP centroid
\\echo ${SECTION_MARKER}:check3
SELECT p.id, p.name, p.zip, p.state,
  ROUND(p.lat::numeric, 4) AS p_lat, ROUND(p.lng::numeric, 4) AS p_lng,
  ROUND(z.lat::numeric, 4) AS z_lat, ROUND(z.lng::numeric, 4) AS z_lng,
  ROUND((3958.8 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(z.lat - p.lat) / 2), 2) +
    COS(RADIANS(p.lat)) * COS(RADIANS(z.lat)) *
    POWER(SIN(RADIANS(z.lng - p.lng) / 2), 2)
  )))::numeric, 1) AS drift_miles
FROM providers p
JOIN _zip_ref z ON z.zip = p.zip
WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
  AND 3958.8 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(z.lat - p.lat) / 2), 2) +
    COS(RADIANS(p.lat)) * COS(RADIANS(z.lat)) *
    POWER(SIN(RADIANS(z.lng - p.lng) / 2), 2)
  )) > ${DRIFT_WARNING_MILES}
ORDER BY drift_miles DESC;

-- Check 4a: Missing ALL geo data (no ZIP + no coordinates)
\\echo ${SECTION_MARKER}:check4a
SELECT id, name, state, address FROM providers
WHERE zip IS NULL AND (lat IS NULL OR lng IS NULL);

-- Check 4b: Has ZIP but no coordinates
\\echo ${SECTION_MARKER}:check4b
SELECT id, name, state, zip FROM providers
WHERE zip IS NOT NULL AND (lat IS NULL OR lng IS NULL);

-- Check 5: City↔state mismatch
\\echo ${SECTION_MARKER}:check5
SELECT p.id, p.name, p.city, p.state, p.zip
FROM providers p
WHERE p.city IS NOT NULL AND p.state IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM _zip_ref z
  WHERE z.state = p.state AND LOWER(z.city) = LOWER(p.city)
);

\\echo ${SECTION_MARKER}:done
  `.trim();
}

// ---------------------------------------------------------------------------
// Parse psql output into sections
// ---------------------------------------------------------------------------

function parseSections(output: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = output.split(SECTION_MARKER + ":");

  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    if (newlineIdx === -1) {
      sections.set(part.trim(), "");
      continue;
    }
    const name = part.slice(0, newlineIdx).trim();
    const body = part.slice(newlineIdx + 1).trim();
    sections.set(name, body);
  }

  return sections;
}

function parseRows(
  output: string,
  columns: string[]
): Record<string, string>[] {
  if (!output) return [];
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const values = line.split("\t");
      const row: Record<string, string> = {};
      columns.forEach((col, i) => {
        row[col] = values[i] ?? "";
      });
      return row;
    });
}

// ---------------------------------------------------------------------------
// Run the audit
// ---------------------------------------------------------------------------

function runAudit(csvPath: string): AuditResult[] {
  console.log("[audit] Building psql script...");
  const script = buildAuditScript(csvPath);

  console.log("[audit] Running single psql session (temp table + 5 checks)...");
  const result = spawnSync(PSQL_BIN, [DB_URL, "-t", "-A", "-F", "\t"], {
    input: script,
    encoding: "utf-8",
    timeout: 120_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed (exit ${result.status}): ${result.stderr}`);
  }

  // Check stderr for errors (psql reports \COPY errors there)
  if (result.stderr) {
    const errorLines = result.stderr
      .split("\n")
      .filter((l) => l.startsWith("ERROR:"));
    if (errorLines.length > 0) {
      console.error("[psql] Errors detected:");
      for (const line of errorLines) console.error(`  ${line}`);
      throw new Error(`psql reported errors: ${errorLines[0]}`);
    }
  }

  const sections = parseSections(result.stdout);
  const results: AuditResult[] = [];

  // Setup verification
  const setupCount = sections.get("setup") ?? "0";
  console.log(`[setup] Temp table has ${setupCount.trim()} ZIP reference rows`);

  // Check 1: ZIP↔state mismatch
  const check1Rows = parseRows(sections.get("check1") ?? "", [
    "id",
    "name",
    "stored_state",
    "zip_state",
    "zip",
    "address",
  ]);
  results.push({
    check: "ZIP↔state mismatch",
    severity: check1Rows.length > 0 ? "CRITICAL" : "INFO",
    count: check1Rows.length,
    rows: check1Rows,
  });

  // Check 2: Invalid ZIPs
  const check2Rows = parseRows(sections.get("check2") ?? "", [
    "id",
    "name",
    "zip",
    "state",
    "address",
  ]);
  results.push({
    check: "Invalid/unresolvable ZIP codes",
    severity: check2Rows.length > 0 ? "WARNING" : "INFO",
    count: check2Rows.length,
    rows: check2Rows,
  });

  // Check 3: Coordinate drift
  const check3Rows = parseRows(sections.get("check3") ?? "", [
    "id",
    "name",
    "zip",
    "state",
    "p_lat",
    "p_lng",
    "z_lat",
    "z_lng",
    "drift_miles",
  ]);
  const criticalDrift = check3Rows.filter(
    (r) => parseFloat(r.drift_miles) > DRIFT_CRITICAL_MILES
  );
  const warningDrift = check3Rows.filter((r) => {
    const d = parseFloat(r.drift_miles);
    return d > DRIFT_WARNING_MILES && d <= DRIFT_CRITICAL_MILES;
  });

  if (criticalDrift.length > 0) {
    results.push({
      check: `Coordinate drift >${DRIFT_CRITICAL_MILES}mi from ZIP centroid`,
      severity: "CRITICAL",
      count: criticalDrift.length,
      rows: criticalDrift,
    });
  }
  if (warningDrift.length > 0) {
    results.push({
      check: `Coordinate drift ${DRIFT_WARNING_MILES}-${DRIFT_CRITICAL_MILES}mi from ZIP centroid`,
      severity: "WARNING",
      count: warningDrift.length,
      rows: warningDrift,
    });
  }
  if (check3Rows.length === 0) {
    results.push({
      check: `Coordinate drift >${DRIFT_WARNING_MILES}mi from ZIP centroid`,
      severity: "INFO",
      count: 0,
      rows: [],
    });
  }

  // Check 4a: Missing ALL geo data
  const check4aRows = parseRows(sections.get("check4a") ?? "", [
    "id",
    "name",
    "state",
    "address",
  ]);
  results.push({
    check: "Missing ALL geo data (no ZIP + no coordinates)",
    severity: check4aRows.length > 0 ? "CRITICAL" : "INFO",
    count: check4aRows.length,
    rows: check4aRows,
  });

  // Check 4b: Has ZIP, missing coordinates
  const check4bRows = parseRows(sections.get("check4b") ?? "", [
    "id",
    "name",
    "state",
    "zip",
  ]);
  results.push({
    check: "Has ZIP but missing coordinates",
    severity: check4bRows.length > 0 ? "WARNING" : "INFO",
    count: check4bRows.length,
    rows: check4bRows,
  });

  // Check 5: City↔state mismatch
  const check5Rows = parseRows(sections.get("check5") ?? "", [
    "id",
    "name",
    "city",
    "state",
    "zip",
  ]);
  results.push({
    check: "City not found in state (city↔state mismatch)",
    severity: "INFO",
    count: check5Rows.length,
    rows: check5Rows,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(results: AuditResult[]): void {
  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗"
  );
  console.log("║         ClearCost Provider Geography Audit Report          ║");
  console.log(
    "╠══════════════════════════════════════════════════════════════╣"
  );
  console.log(`║  Generated: ${new Date().toISOString()}              ║`);
  console.log(
    "╚══════════════════════════════════════════════════════════════╝"
  );

  const severityOrder: Record<Severity, number> = {
    CRITICAL: 3,
    WARNING: 2,
    INFO: 1,
  };
  const sorted = [...results].sort(
    (a, b) => severityOrder[b.severity] - severityOrder[a.severity]
  );

  // Summary table
  console.log(
    "\n┌─────────┬──────────────────────────────────────────────────┬───────┐"
  );
  console.log(
    "│ Severity│ Check                                            │ Count │"
  );
  console.log(
    "├─────────┼──────────────────────────────────────────────────┼───────┤"
  );
  for (const r of sorted) {
    const sev = r.severity.padEnd(8);
    const check = r.check.padEnd(50).slice(0, 50);
    const count = String(r.count).padStart(5);
    console.log(`│ ${sev}│ ${check}│${count} │`);
  }
  console.log(
    "└─────────┴──────────────────────────────────────────────────┴───────┘"
  );

  // Detail sections for non-empty results
  for (const r of sorted) {
    if (r.count === 0) continue;

    const icon =
      r.severity === "CRITICAL"
        ? "!!!"
        : r.severity === "WARNING"
          ? " ! "
          : " i ";
    console.log(`\n[${icon}] ${r.severity}: ${r.check} (${r.count} rows)`);
    console.log("─".repeat(70));

    const displayRows = r.rows.slice(0, 30);
    for (const row of displayRows) {
      const parts = Object.entries(row)
        .map(([k, v]) => `${k}=${v}`)
        .join(" | ");
      console.log(`  ${parts}`);
    }
    if (r.count > 30) {
      console.log(`  ... and ${r.count - 30} more`);
    }
  }

  // Final verdict
  const criticalCount = sorted.filter(
    (r) => r.severity === "CRITICAL" && r.count > 0
  ).length;
  const warningCount = sorted.filter(
    (r) => r.severity === "WARNING" && r.count > 0
  ).length;

  console.log(
    "\n══════════════════════════════════════════════════════════════"
  );
  if (criticalCount === 0 && warningCount === 0) {
    console.log("RESULT: All checks passed. Provider geography data is clean.");
  } else {
    console.log(
      `RESULT: ${criticalCount} CRITICAL, ${warningCount} WARNING issues found.`
    );
    if (criticalCount > 0) {
      console.log(
        "Action required: investigate and fix CRITICAL issues before they affect search quality."
      );
    }
  }
  console.log(
    "══════════════════════════════════════════════════════════════\n"
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log("Starting provider geography audit...\n");

  const csvPath = exportZipReferenceCsv();

  try {
    const results = runAudit(csvPath);
    printReport(results);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`Audit completed in ${elapsed}s`);
  } finally {
    try {
      unlinkSync(csvPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

main().catch((err) => {
  console.error(
    "Audit failed:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
