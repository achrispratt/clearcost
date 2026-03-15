/**
 * Import Turquoise Health Standard Service Packages (SSPs) into episode tables.
 *
 * Source: https://github.com/turquoisehealth/servicepackages.health
 * Clone the repo, then point --dir at the `outputs/` directory.
 *
 * Run with:
 *   npx tsx --env-file=.env.local lib/data/import-ssps.ts \
 *     --dir /path/to/servicepackages.health/outputs
 *
 * Options:
 *   --dir <path>            Path to SSP outputs/ directory (required)
 *   --min-association <n>   Minimum association to import (default: 0.3)
 *   --limit <n>             Limit number of SSP files processed (for testing)
 *   --dry-run               Parse + stats, no DB writes
 *   --fresh                 DELETE existing episode data before import
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { parse as csvParse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Code type classification
// ---------------------------------------------------------------------------

function classifyCodeType(code: string): "cpt" | "hcpcs" | "revenue_code" {
  const trimmed = code.trim();

  // 4-digit codes starting with 0 are revenue codes (0360, 0636, etc.)
  if (/^0\d{3}$/.test(trimmed)) return "revenue_code";

  // Codes starting with a letter (C, G, J, Q, etc.) are HCPCS Level II
  if (/^[A-Za-z]/.test(trimmed)) return "hcpcs";

  // Everything else (5-digit numeric, Category III ending in T) = CPT
  return "cpt";
}

function classifyPrincipalCodeType(code: string): "cpt" | "hcpcs" {
  if (/^[A-Za-z]/.test(code.trim())) return "hcpcs";
  return "cpt";
}

function classifyTier(
  association: number
): "required" | "expected" | "optional" {
  if (association >= 0.7) return "required";
  if (association >= 0.4) return "expected";
  return "optional";
}

// ---------------------------------------------------------------------------
// Category map for known procedure families
// ---------------------------------------------------------------------------

const CATEGORY_PATTERNS: Array<{ regex: RegExp; category: string }> = [
  { regex: /^(27\d{3}|23\d{3}|29\d{3})$/, category: "orthopedic" },
  { regex: /^(933\d{2}|935\d{2}|936\d{2}|37\d{3})$/, category: "cardiac" },
  { regex: /^(45\d{3}|43\d{3}|44\d{3}|47\d{3})$/, category: "gi" },
  { regex: /^(58\d{3}|57\d{3}|56\d{3})$/, category: "gyn" },
  { regex: /^(66\d{3}|67\d{3}|65\d{3})$/, category: "ophthalmology" },
  { regex: /^(35\d{3}|36\d{3}|34\d{3})$/, category: "vascular" },
  { regex: /^(61\d{3}|62\d{3}|63\d{3})$/, category: "neurosurgery" },
  { regex: /^(19\d{3})$/, category: "breast" },
  {
    regex: /^(50\d{3}|51\d{3}|52\d{3}|53\d{3}|54\d{3}|55\d{3})$/,
    category: "urology",
  },
  { regex: /^(30\d{3}|31\d{3})$/, category: "ent" },
  { regex: /^(49\d{3}|46\d{3}|42\d{3})$/, category: "general_surgery" },
];

function inferCategory(code: string): string | null {
  for (const pattern of CATEGORY_PATTERNS) {
    if (pattern.regex.test(code)) return pattern.category;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    dir?: string;
    minAssociation: number;
    limit?: number;
    dryRun: boolean;
    fresh: boolean;
  } = {
    minAssociation: 0.3,
    dryRun: false,
    fresh: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir":
        opts.dir = args[++i];
        break;
      case "--min-association":
        opts.minAssociation = parseFloat(args[++i]);
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

  if (!opts.dir) {
    console.error("Error: --dir <path> is required");
    console.error(
      "  npx tsx --env-file=.env.local lib/data/import-ssps.ts --dir /path/to/servicepackages.health/outputs"
    );
    process.exit(1);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Label lookup
// ---------------------------------------------------------------------------

async function buildLabelMap(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();

  // Source 1: medicare_benchmarks table (has descriptions for ~800 codes)
  const { data: benchmarks } = await supabase
    .from("medicare_benchmarks")
    .select("code, description")
    .not("description", "is", null);

  if (benchmarks) {
    for (const row of benchmarks) {
      if (row.description) {
        labels.set(row.code, row.description);
      }
    }
  }

  // Source 2: final-codes.json doesn't have descriptions, so skip it
  // The medicare_benchmarks table is our best source of labels

  console.log(`  Label sources: ${labels.size} from medicare_benchmarks`);
  return labels;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

interface ParsedComponent {
  code: string;
  codeType: "cpt" | "hcpcs" | "revenue_code";
  tier: "required" | "expected" | "optional";
  association: number;
  totalCount: number;
  resolvedFrom: string[];
}

function parseSspCsv(
  filePath: string,
  minAssociation: number
): ParsedComponent[] {
  const content = readFileSync(filePath, "utf-8");
  const rows: string[][] = csvParse(content, {
    relax_column_count: true,
    skip_empty_lines: true,
  });

  // CSV schema: cpt, total_count, association, resolveFroms
  // First row is header
  const components: ParsedComponent[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const code = (row[0] ?? "").trim();
    if (!code) continue;

    const totalCount = parseInt(row[1] ?? "0", 10) || 0;
    const association = parseFloat(row[2] ?? "0") || 0;

    if (association < minAssociation) continue;

    const resolvedFromRaw = (row[3] ?? "").trim();
    const resolvedFrom = resolvedFromRaw
      ? resolvedFromRaw
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    components.push({
      code,
      codeType: classifyCodeType(code),
      tier: classifyTier(association),
      association,
      totalCount,
      resolvedFrom,
    });
  }

  return components;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const dirPath = resolve(opts.dir!);

  console.log(`\n=== Turquoise SSP Import ===`);
  console.log(`Directory: ${dirPath}`);
  console.log(`Min association: ${opts.minAssociation}`);
  if (opts.limit) console.log(`Limit: ${opts.limit} files`);
  if (opts.dryRun) console.log("Mode: DRY RUN (no DB writes)");
  if (opts.fresh) console.log("Mode: FRESH (will delete existing episodes)");

  // Find all SSP CSV files
  const allFiles = readdirSync(dirPath).filter(
    (f) => f.startsWith("beta_sorted_") && f.endsWith(".csv")
  );
  allFiles.sort();

  const files = opts.limit ? allFiles.slice(0, opts.limit) : allFiles;
  console.log(`\nSSP files found: ${allFiles.length}`);
  console.log(`Processing: ${files.length}`);

  // Load our code list for overlap tracking
  const finalCodesJson = readFileSync(
    resolve(__dirname, "final-codes.json"),
    "utf-8"
  );
  const ourCodes = new Set<string>(JSON.parse(finalCodesJson) as string[]);

  // Parse all SSP files
  interface EpisodeParsed {
    principalCode: string;
    principalCodeType: "cpt" | "hcpcs";
    components: ParsedComponent[];
  }

  const episodes: EpisodeParsed[] = [];
  let totalComponents = 0;
  let overlapCount = 0;

  const codeTypeStats = { cpt: 0, hcpcs: 0, revenue_code: 0 };
  const tierStats = { required: 0, expected: 0, optional: 0 };

  for (const file of files) {
    // Extract principal code from filename: beta_sorted_27447.csv -> 27447
    const match = file.match(/^beta_sorted_(.+)\.csv$/);
    if (!match) continue;

    const principalCode = match[1];
    const components = parseSspCsv(resolve(dirPath, file), opts.minAssociation);

    if (ourCodes.has(principalCode)) overlapCount++;

    for (const comp of components) {
      codeTypeStats[comp.codeType]++;
      tierStats[comp.tier]++;
    }

    totalComponents += components.length;
    episodes.push({
      principalCode,
      principalCodeType: classifyPrincipalCodeType(principalCode),
      components,
    });
  }

  console.log(`\n--- Parse Results ---`);
  console.log(`Episodes parsed: ${episodes.length}`);
  console.log(`Total components: ${totalComponents}`);
  console.log(`Overlap with our codes: ${overlapCount}/${ourCodes.size}`);
  console.log(`\nComponent code types:`);
  console.log(`  CPT: ${codeTypeStats.cpt}`);
  console.log(`  HCPCS: ${codeTypeStats.hcpcs}`);
  console.log(`  Revenue: ${codeTypeStats.revenue_code}`);
  console.log(`\nComponent tiers:`);
  console.log(`  Required (>=0.7): ${tierStats.required}`);
  console.log(`  Expected (0.4-0.7): ${tierStats.expected}`);
  console.log(`  Optional (0.3-0.4): ${tierStats.optional}`);

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

  // Build label map
  console.log("\nBuilding label map...");
  const labelMap = await buildLabelMap(supabase);

  if (opts.fresh) {
    console.log("\nDeleting existing episode data...");
    // Components cascade-delete with definitions
    const { error } = await supabase
      .from("episode_definitions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
    if (error) {
      console.error("Delete failed:", error.message);
      process.exit(1);
    }
    console.log("Existing episode data deleted.");
  }

  // Phase 1: Upsert episode_definitions
  console.log(`\nUpserting ${episodes.length} episode definitions...`);
  const BATCH_SIZE = 100;
  let defsInserted = 0;

  // Map from principalCode -> episode UUID (needed for component inserts)
  const episodeIdMap = new Map<string, string>();

  for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
    const batch = episodes.slice(i, i + BATCH_SIZE).map((ep) => ({
      ssp_code: ep.principalCode,
      principal_code: ep.principalCode,
      principal_code_type: ep.principalCodeType,
      label: labelMap.get(ep.principalCode) || `Procedure ${ep.principalCode}`,
      category: inferCategory(ep.principalCode),
      source: "turquoise_ssp",
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("episode_definitions")
      .upsert(batch, { onConflict: "ssp_code" })
      .select("id, ssp_code");

    if (error) {
      console.error(
        `Definition batch ${i / BATCH_SIZE + 1} failed:`,
        error.message
      );
      process.exit(1);
    }

    if (data) {
      for (const row of data) {
        episodeIdMap.set(row.ssp_code, row.id);
      }
    }

    defsInserted += batch.length;
    if (defsInserted % 500 === 0 || defsInserted === episodes.length) {
      console.log(
        `  ${defsInserted} / ${episodes.length} definitions upserted`
      );
    }
  }

  // Phase 2: Upsert episode_components
  console.log(`\nUpserting components...`);
  let compsInserted = 0;
  let compsSkipped = 0;

  for (const ep of episodes) {
    const episodeId = episodeIdMap.get(ep.principalCode);
    if (!episodeId) {
      compsSkipped += ep.components.length;
      continue;
    }

    if (ep.components.length === 0) continue;

    // Batch components for this episode
    for (let i = 0; i < ep.components.length; i += BATCH_SIZE) {
      const batch = ep.components.slice(i, i + BATCH_SIZE).map((comp) => ({
        episode_id: episodeId,
        code: comp.code,
        code_type: comp.codeType,
        tier: comp.tier,
        association: comp.association,
        total_count: comp.totalCount,
        resolved_from: comp.resolvedFrom.length > 0 ? comp.resolvedFrom : null,
      }));

      const { error } = await supabase
        .from("episode_components")
        .upsert(batch, {
          onConflict: "episode_id,code",
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(
          `Component batch for ${ep.principalCode} failed:`,
          error.message
        );
        // Continue with other episodes rather than halting
        compsSkipped += batch.length;
        continue;
      }

      compsInserted += batch.length;
    }

    if (compsInserted % 5000 === 0 && compsInserted > 0) {
      console.log(`  ${compsInserted} components upserted...`);
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Episode definitions upserted: ${defsInserted}`);
  console.log(`Episode components upserted: ${compsInserted}`);
  if (compsSkipped > 0)
    console.log(`Components skipped/failed: ${compsSkipped}`);
  console.log(`Overlap with our ${ourCodes.size} codes: ${overlapCount}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
