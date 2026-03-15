/**
 * Import CMS Physician Fee Schedule (PFS) national rates into medicare_benchmarks.
 *
 * Downloads: https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files
 * File format: pipe-delimited CSV (e.g., PFRVS_2025A.csv)
 *
 * Run with:
 *   npx tsx --env-file=.env.local lib/data/import-medicare-pfs.ts \
 *     --file ~/Downloads/PFRVS_2025A.csv --year 2025
 *
 * Options:
 *   --file <path>     Path to downloaded PFS CSV (required)
 *   --year <n>        Fee schedule year (default: 2025)
 *   --codes <file>    Only import matching codes (default: lib/data/final-codes.json)
 *   --limit <n>       Limit rows inserted (for testing)
 *   --dry-run         Parse + stats, no DB write
 *   --fresh           DELETE existing benchmarks before import
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { createInterface } from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    file?: string;
    year: number;
    codesFile: string;
    limit?: number;
    dryRun: boolean;
    fresh: boolean;
  } = {
    year: 2025,
    codesFile: resolve(__dirname, "final-codes.json"),
    dryRun: false,
    fresh: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--file":
        opts.file = args[++i];
        break;
      case "--year":
        opts.year = parseInt(args[++i], 10);
        break;
      case "--codes":
        opts.codesFile = resolve(args[++i]);
        break;
      case "--limit":
        opts.limit = parseInt(args[++i], 10);
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--fresh":
        opts.fresh = true;
        break;
    }
  }

  if (!opts.file) {
    console.error("Error: --file <path> is required");
    console.error(
      "  npx tsx --env-file=.env.local lib/data/import-medicare-pfs.ts --file ~/Downloads/PFRVS_2025A.csv"
    );
    process.exit(1);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// PFS CSV parser (pipe-delimited)
// ---------------------------------------------------------------------------

interface PfsRow {
  code: string;
  modifier: string;
  description: string;
  statusCode: string;
  facilityRate: number;
  nonFacilityRate: number;
  conversionFactor: number;
}

function parsePfsLine(
  line: string,
  headerIndex: Map<string, number>
): PfsRow | null {
  const fields = line.split("|").map((f) => f.trim().replace(/^"|"$/g, ""));

  const get = (name: string): string => {
    const idx = headerIndex.get(name);
    return idx != null ? (fields[idx] ?? "") : "";
  };

  const code = get("HCPCS");
  if (!code) return null;

  const facilityRate = parseFloat(get("FAC_PRICING_AMOUNT")) || 0;
  const nonFacilityRate = parseFloat(get("NON_FAC_PRICING_AMOUNT")) || 0;

  return {
    code,
    modifier: get("MOD"),
    description: get("DESCRIPTION"),
    statusCode: get("STATUS_CODE"),
    facilityRate,
    nonFacilityRate,
    conversionFactor: parseFloat(get("CONVERSION_FACTOR")) || 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const filePath = resolve(opts.file!);

  console.log(`\n=== CMS PFS Import ===`);
  console.log(`File: ${filePath}`);
  console.log(`Year: ${opts.year}`);
  console.log(`Codes file: ${opts.codesFile}`);
  if (opts.dryRun) console.log("Mode: DRY RUN (no DB writes)");
  if (opts.fresh) console.log("Mode: FRESH (will delete existing benchmarks)");

  // Load target codes
  const codesJson = readFileSync(opts.codesFile, "utf-8");
  const targetCodes = new Set<string>(JSON.parse(codesJson) as string[]);
  console.log(`Target codes: ${targetCodes.size}`);

  // Parse header line to build column index
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let headerIndex: Map<string, number> | null = null;
  const matched: Map<
    string,
    {
      code: string;
      description: string;
      facilityRate: number;
      nonFacilityRate: number;
      conversionFactor: number;
      statusCode: string;
    }
  > = new Map();
  let totalLines = 0;
  let skippedNotInCodes = 0;
  let skippedModifier = 0;
  let skippedNoRate = 0;

  for await (const line of rl) {
    if (!headerIndex) {
      // First line is the header
      const headers = line
        .split("|")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      headerIndex = new Map(headers.map((h, i) => [h, i]));
      console.log(`CSV columns: ${headers.length}`);
      continue;
    }

    totalLines++;
    const row = parsePfsLine(line, headerIndex);
    if (!row) continue;

    // Filter: code must be in our target set
    if (!targetCodes.has(row.code)) {
      skippedNotInCodes++;
      continue;
    }

    // Filter: skip modifier variants (keep only base/global rate where MOD is blank)
    if (row.modifier !== "") {
      skippedModifier++;
      continue;
    }

    // Filter: must have at least one pricing amount
    if (row.facilityRate === 0 && row.nonFacilityRate === 0) {
      skippedNoRate++;
      continue;
    }

    // Keep first match per code (some files may have duplicates)
    if (!matched.has(row.code)) {
      matched.set(row.code, {
        code: row.code,
        description: row.description,
        facilityRate: row.facilityRate,
        nonFacilityRate: row.nonFacilityRate,
        conversionFactor: row.conversionFactor,
        statusCode: row.statusCode,
      });
    }
  }

  console.log(`\n--- Parse Results ---`);
  console.log(`Total data lines: ${totalLines}`);
  console.log(`Matched codes: ${matched.size}`);
  console.log(`Skipped (not in codes): ${skippedNotInCodes}`);
  console.log(`Skipped (has modifier): ${skippedModifier}`);
  console.log(`Skipped (no rate): ${skippedNoRate}`);

  // Stats on what we found
  const rates = [...matched.values()]
    .map((r) => r.facilityRate)
    .filter((r) => r > 0);
  if (rates.length > 0) {
    rates.sort((a, b) => a - b);
    console.log(
      `\nFacility rate range: $${rates[0].toFixed(2)} – $${rates[rates.length - 1].toFixed(2)}`
    );
    console.log(
      `Median facility rate: $${rates[Math.floor(rates.length / 2)].toFixed(2)}`
    );
  }

  if (opts.dryRun) {
    console.log("\nDry run complete — no data written.");
    process.exit(0);
  }

  // --- DB writes ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  if (opts.fresh) {
    console.log("\nDeleting existing benchmarks...");
    const { error } = await supabase
      .from("medicare_benchmarks")
      .delete()
      .gte("pfs_year", 0); // delete all rows
    if (error) {
      console.error("Delete failed:", error.message);
      process.exit(1);
    }
    console.log("Existing benchmarks deleted.");
  }

  // Batch upsert
  const rows = [...matched.values()];
  const limit = opts.limit ? Math.min(opts.limit, rows.length) : rows.length;
  const BATCH_SIZE = 100;
  let inserted = 0;

  console.log(`\nUpserting ${limit} rows (batch size ${BATCH_SIZE})...`);

  for (let i = 0; i < limit; i += BATCH_SIZE) {
    const batch = rows.slice(i, Math.min(i + BATCH_SIZE, limit)).map((r) => ({
      code: r.code,
      description: r.description || null,
      facility_rate: r.facilityRate || null,
      non_facility_rate: r.nonFacilityRate || null,
      conversion_factor: r.conversionFactor || null,
      pfs_year: opts.year,
      status_code: r.statusCode || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("medicare_benchmarks")
      .upsert(batch, { onConflict: "code" });

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    if (inserted % 500 === 0 || inserted === limit) {
      console.log(`  ${inserted} / ${limit} upserted`);
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Rows upserted: ${inserted}`);
  console.log(
    `Target codes without PFS match: ${targetCodes.size - matched.size}`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
