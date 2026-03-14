/**
 * Extract SSP expansion candidate codes from Turquoise SSP data.
 *
 * Reuses the ssp-analysis.ts logic to find billable codes (CPT/HCPCS)
 * that appear in SSP episodes but aren't in our current import list.
 * Filters: ≥10 episodes, avg association ≥0.3.
 *
 * Outputs to lib/data/import-sets/ssp-expansion.json
 *
 * Usage: npx tsx scripts/extract-ssp-expansion.ts
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SSP_DIR = join(process.env.HOME || "~", "Projects/ssp-data/outputs");
const CODE_LIST_PATH = join(__dirname, "../lib/data/final-codes.json");
const OUTPUT_DIR = join(__dirname, "../lib/data/import-sets");
const OUTPUT_PATH = join(OUTPUT_DIR, "ssp-expansion.json");

const FACILITY_THRESHOLD = 0.4;

const HCPCS_LEVEL2_RE = /^[A-VX-Z]\d{4}$/;
const CPT_CAT3_RE = /^\d{4}T$/;
const CPT_STANDARD_RE = /^\d{5}$/;

type CodeType =
  | "cpt"
  | "hcpcs"
  | "revenue_code"
  | "c_code"
  | "cpt_cat3"
  | "unknown";
const BILLABLE_CODE_TYPES: readonly CodeType[] = ["cpt", "hcpcs", "cpt_cat3"];

function classifyCode(code: string): CodeType {
  if (/^0\d{3}$/.test(code)) return "revenue_code";
  if (/^C\d{4}$/.test(code)) return "c_code";
  if (CPT_CAT3_RE.test(code)) return "cpt_cat3";
  if (HCPCS_LEVEL2_RE.test(code)) return "hcpcs";
  if (CPT_STANDARD_RE.test(code)) return "cpt";
  if (/^[A-Z]\d{3,4}[A-Z]?$/.test(code)) return "hcpcs";
  return "unknown";
}

async function main() {
  // Load our current codes
  const ourCodes = new Set<string>(
    JSON.parse(readFileSync(CODE_LIST_PATH, "utf-8"))
  );
  console.log(`Loaded ${ourCodes.size} existing codes from final-codes.json`);

  // Load SSP episodes
  const files = readdirSync(SSP_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`Found ${files.length} SSP files in ${SSP_DIR}`);

  // Build frequency map: code → { episodes, associations }
  const codeFrequency = new Map<
    string,
    { episodes: number; associations: number[]; codeType: CodeType }
  >();

  for (const file of files) {
    const content = readFileSync(join(SSP_DIR, file), "utf-8");
    const lines = content.trim().split("\n");

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(",");
      if (parts.length < 3) continue;

      const code = parts[0].trim();
      const association = parseFloat(parts[2]) || 0;

      // Only facility-tier components
      if (association < FACILITY_THRESHOLD) continue;

      const existing = codeFrequency.get(code) || {
        episodes: 0,
        associations: [],
        codeType: classifyCode(code),
      };
      existing.episodes++;
      existing.associations.push(association);
      codeFrequency.set(code, existing);
    }
  }

  console.log(
    `Found ${codeFrequency.size} unique facility-tier component codes`
  );

  // Filter to expansion candidates: billable, not in our list, ≥10 episodes, avg assoc ≥0.3
  const candidates: {
    code: string;
    codeType: CodeType;
    episodes: number;
    avgAssoc: number;
  }[] = [];

  for (const [code, freq] of codeFrequency) {
    if (ourCodes.has(code)) continue;
    if (!BILLABLE_CODE_TYPES.includes(freq.codeType)) continue;
    if (freq.episodes < 10) continue;

    const avgAssoc =
      freq.associations.reduce((a, b) => a + b, 0) / freq.associations.length;
    if (avgAssoc < 0.3) continue;

    candidates.push({
      code,
      codeType: freq.codeType,
      episodes: freq.episodes,
      avgAssoc,
    });
  }

  candidates.sort((a, b) => b.episodes - a.episodes);

  console.log(`\nExpansion candidates: ${candidates.length} codes`);
  console.log("\nTop 20:");
  for (const c of candidates.slice(0, 20)) {
    console.log(
      `  ${c.code.padEnd(8)} ${c.codeType.padEnd(10)} ${c.episodes} episodes, avg assoc ${c.avgAssoc.toFixed(2)}`
    );
  }

  // Extract just the code strings, sorted
  const expansionCodes = candidates.map((c) => c.code).sort();

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(expansionCodes, null, 2) + "\n");
  console.log(`\nWrote ${expansionCodes.length} codes to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
