/**
 * SSP Dataset Analysis Script
 *
 * Parses Turquoise Health Standard Service Packages and analyzes overlap
 * with ClearCost's code list and Supabase charge data.
 *
 * Usage: npx tsx --env-file=.env.local scripts/ssp-analysis.ts
 *
 * Reusable for #92 (full SSP integration).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SSP_DIR = join(process.env.HOME || "~", "Projects/ssp-data/outputs");
const CODE_LIST_PATH = join(__dirname, "../lib/data/final-codes.json");

// Association thresholds (from Turquoise methodology)
const FACILITY_THRESHOLD = 0.4;
const OPTIONAL_LOWER = 0.3;

// Code classification regex
const REVENUE_CODE_RE = /^0\d{3}$/; // 4-digit starting with 0
const HCPCS_LEVEL2_RE = /^[A-VX-Z]\d{4}$/; // Letter + 4 digits (A-V, X-Z)
const CPT_CAT3_RE = /^\d{4}T$/; // Category III CPT (####T)
const CPT_STANDARD_RE = /^\d{5}$/; // Standard 5-digit CPT
const C_CODE_RE = /^C\d{4}$/; // C-codes (HCPCS C category)

type CodeType =
  | "cpt"
  | "hcpcs"
  | "revenue_code"
  | "c_code"
  | "cpt_cat3"
  | "unknown";

// Code types that represent separately billable services (not institutional cost centers)
const BILLABLE_CODE_TYPES: readonly CodeType[] = ["cpt", "hcpcs", "cpt_cat3"];

function classifyCode(code: string): CodeType {
  if (REVENUE_CODE_RE.test(code)) return "revenue_code";
  if (C_CODE_RE.test(code)) return "c_code";
  if (CPT_CAT3_RE.test(code)) return "cpt_cat3";
  if (HCPCS_LEVEL2_RE.test(code)) return "hcpcs";
  if (CPT_STANDARD_RE.test(code)) return "cpt";
  // W-codes are HCPCS too, catch any letter+digits pattern
  if (/^[A-Z]\d{3,4}[A-Z]?$/.test(code)) return "hcpcs";
  return "unknown";
}

// ---------------------------------------------------------------------------
// SSP Parsing
// ---------------------------------------------------------------------------

interface SSPComponent {
  code: string;
  totalCount: number;
  association: number;
  resolvedFrom: string[];
  codeType: CodeType;
}

interface SSPEpisode {
  principalCode: string;
  principalCodeType: CodeType;
  components: SSPComponent[];
  facilityComponents: SSPComponent[]; // association >= 0.4
  optionalComponents: SSPComponent[]; // 0.3 <= association < 0.4
}

function parseSSPFile(filePath: string, principalCode: string): SSPEpisode {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  const components: SSPComponent[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV: cpt,total_count,association,resolveFroms
    const parts = line.split(",");
    if (parts.length < 3) continue;

    const code = parts[0].trim();
    const totalCount = parseInt(parts[1], 10) || 0;
    const association = parseFloat(parts[2]) || 0;
    const resolvedFrom = parts[3]
      ? parts[3]
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];

    components.push({
      code,
      totalCount,
      association,
      resolvedFrom,
      codeType: classifyCode(code),
    });
  }

  // Classify into tiers based on Turquoise thresholds
  const facilityComponents = components.filter(
    (c) => c.association >= FACILITY_THRESHOLD
  );
  const optionalComponents = components.filter(
    (c) => c.association >= OPTIONAL_LOWER && c.association < FACILITY_THRESHOLD
  );

  return {
    principalCode,
    principalCodeType: classifyCode(principalCode),
    components,
    facilityComponents,
    optionalComponents,
  };
}

function loadAllSSPEpisodes(): SSPEpisode[] {
  const files = readdirSync(SSP_DIR).filter((f) => f.endsWith(".csv"));
  const episodes: SSPEpisode[] = [];

  for (const file of files) {
    const principalCode = file.replace("beta_sorted_", "").replace(".csv", "");
    try {
      episodes.push(parseSSPFile(join(SSP_DIR, file), principalCode));
    } catch {
      console.warn(`  Warning: Could not parse ${file}`);
    }
  }

  return episodes;
}

// ---------------------------------------------------------------------------
// Layer 1: SSP vs Code List
// ---------------------------------------------------------------------------

interface Layer1Results {
  ourCodes: Set<string>;
  sspPrincipalCodes: Set<string>;
  overlap: Set<string>;
  sspOnly: Set<string>;
  ourOnly: Set<string>;
  overlapByCodeType: Map<CodeType, number>;
  sspPrincipalByType: Map<CodeType, number>;
}

function analyzeLayer1(
  episodes: SSPEpisode[],
  ourCodes: Set<string>
): Layer1Results {
  const sspPrincipalCodes = new Set(episodes.map((e) => e.principalCode));
  const overlap = new Set(
    [...ourCodes].filter((c) => sspPrincipalCodes.has(c))
  );
  const sspOnly = new Set(
    [...sspPrincipalCodes].filter((c) => !ourCodes.has(c))
  );
  const ourOnly = new Set(
    [...ourCodes].filter((c) => !sspPrincipalCodes.has(c))
  );

  const overlapByCodeType = new Map<CodeType, number>();
  for (const code of overlap) {
    const ct = classifyCode(code);
    overlapByCodeType.set(ct, (overlapByCodeType.get(ct) || 0) + 1);
  }

  const sspPrincipalByType = new Map<CodeType, number>();
  for (const ep of episodes) {
    sspPrincipalByType.set(
      ep.principalCodeType,
      (sspPrincipalByType.get(ep.principalCodeType) || 0) + 1
    );
  }

  return {
    ourCodes,
    sspPrincipalCodes,
    overlap,
    sspOnly,
    ourOnly,
    overlapByCodeType,
    sspPrincipalByType,
  };
}

// ---------------------------------------------------------------------------
// Layer 2: SSP Component Codes vs Supabase Charges
// ---------------------------------------------------------------------------

interface EpisodeCoverage {
  principalCode: string;
  facilityComponents: number;
  cptHcpcsCodes: string[]; // billable codes (not revenue)
  priceableCodes: string[]; // codes we have charges for
  missingCodes: string[]; // codes we don't have charges for
  revenueCodeCount: number; // revenue codes (not in our data model)
  coverageRatio: number; // priceable / (cptHcpcsCodes count)
}

interface Layer2Results {
  episodeCoverage: EpisodeCoverage[];
  allComponentCodes: Set<string>;
  allBillableCodes: Set<string>; // CPT + HCPCS only
  priceableCodes: Set<string>;
  missingCodes: Set<string>;
  overallCoverageRatio: number;
  medianCoverageRatio: number;
  episodesWithFullCoverage: number;
  episodesWithZeroCoverage: number;
}

async function analyzeLayer2(
  episodes: SSPEpisode[],
  overlapEpisodes: SSPEpisode[]
): Promise<Layer2Results> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Collect all unique billable component codes from overlap episodes
  // (facility-tier only — association >= 0.4)
  const allComponentCodes = new Set<string>();
  const allBillableCodes = new Set<string>();

  for (const ep of overlapEpisodes) {
    for (const comp of ep.facilityComponents) {
      allComponentCodes.add(comp.code);
      const ct = comp.codeType;
      if (BILLABLE_CODE_TYPES.includes(ct)) {
        allBillableCodes.add(comp.code);
      }
    }
  }

  console.log(
    `  Checking ${allBillableCodes.size} unique billable component codes against Supabase...`
  );

  // Use the existing audit_code_coverage RPC — pushes the work to Postgres
  const codesArray = [...allBillableCodes];
  const priceableCodes = new Set<string>();
  const BATCH_SIZE = 500;

  for (let i = 0; i < codesArray.length; i += BATCH_SIZE) {
    const batch = codesArray.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase.rpc("audit_code_coverage", {
      p_codes: batch,
    });

    if (error) {
      console.error("  Supabase RPC error:", error.message);
      continue;
    }

    if (data) {
      for (const row of data as { code: string; match_count: number }[]) {
        if (row.match_count > 0) {
          priceableCodes.add(row.code);
        }
      }
    }
  }

  console.log(
    `  Found charges for ${priceableCodes.size}/${allBillableCodes.size} component codes`
  );

  // Per-episode coverage
  const episodeCoverage: EpisodeCoverage[] = [];
  for (const ep of overlapEpisodes) {
    const cptHcpcsCodes = ep.facilityComponents
      .filter((c) => BILLABLE_CODE_TYPES.includes(c.codeType))
      .map((c) => c.code);
    const priceable = cptHcpcsCodes.filter((c) => priceableCodes.has(c));
    const missing = cptHcpcsCodes.filter((c) => !priceableCodes.has(c));
    const revenueCodeCount = ep.facilityComponents.filter(
      (c) => c.codeType === "revenue_code"
    ).length;

    episodeCoverage.push({
      principalCode: ep.principalCode,
      facilityComponents: ep.facilityComponents.length,
      cptHcpcsCodes,
      priceableCodes: priceable,
      missingCodes: missing,
      revenueCodeCount,
      coverageRatio:
        cptHcpcsCodes.length > 0 ? priceable.length / cptHcpcsCodes.length : 0,
    });
  }

  const ratios = episodeCoverage
    .map((e) => e.coverageRatio)
    .sort((a, b) => a - b);
  const missingCodes = new Set(
    [...allBillableCodes].filter((c) => !priceableCodes.has(c))
  );

  return {
    episodeCoverage,
    allComponentCodes,
    allBillableCodes,
    priceableCodes,
    missingCodes,
    overallCoverageRatio:
      allBillableCodes.size > 0
        ? priceableCodes.size / allBillableCodes.size
        : 0,
    medianCoverageRatio:
      ratios.length > 0 ? ratios[Math.floor(ratios.length / 2)] : 0,
    episodesWithFullCoverage: episodeCoverage.filter(
      (e) => e.coverageRatio === 1
    ).length,
    episodesWithZeroCoverage: episodeCoverage.filter(
      (e) => e.coverageRatio === 0
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Layer 3: Gap Analysis
// ---------------------------------------------------------------------------

interface GapCode {
  code: string;
  codeType: CodeType;
  episodeCount: number; // how many SSP episodes reference this code
  avgAssociation: number;
  maxAssociation: number;
}

interface Layer3Results {
  frequentMissingCodes: GapCode[];
  codeListExpansionCandidates: GapCode[]; // high-frequency, priceable type
  structuralGaps: GapCode[]; // revenue codes / types we'll never have
  totalUniqueComponentCodes: number;
  componentCodesByType: Map<CodeType, number>;
}

function analyzeLayer3(
  episodes: SSPEpisode[],
  ourCodes: Set<string>
): Layer3Results {
  // Build frequency map across ALL episodes (not just overlap)
  const codeFrequency = new Map<
    string,
    { episodes: number; associations: number[]; codeType: CodeType }
  >();

  for (const ep of episodes) {
    for (const comp of ep.facilityComponents) {
      const existing = codeFrequency.get(comp.code) || {
        episodes: 0,
        associations: [],
        codeType: comp.codeType,
      };
      existing.episodes++;
      existing.associations.push(comp.association);
      codeFrequency.set(comp.code, existing);
    }
  }

  // Count by type
  const componentCodesByType = new Map<CodeType, number>();
  for (const [, val] of codeFrequency) {
    componentCodesByType.set(
      val.codeType,
      (componentCodesByType.get(val.codeType) || 0) + 1
    );
  }

  // Build gap codes
  const gapCodes: GapCode[] = [];
  for (const [code, freq] of codeFrequency) {
    if (!ourCodes.has(code)) {
      gapCodes.push({
        code,
        codeType: freq.codeType,
        episodeCount: freq.episodes,
        avgAssociation:
          freq.associations.reduce((a, b) => a + b, 0) /
          freq.associations.length,
        maxAssociation: Math.max(...freq.associations),
      });
    }
  }

  gapCodes.sort((a, b) => b.episodeCount - a.episodeCount);

  // Codes we could potentially add to our import (CPT/HCPCS, not revenue)
  const expansionCandidates = gapCodes
    .filter(
      (g) =>
        BILLABLE_CODE_TYPES.includes(g.codeType) &&
        g.episodeCount >= 10 &&
        g.avgAssociation >= 0.3
    )
    .slice(0, 100);

  // Structural gaps (revenue codes, C-codes — hospital internal, won't have standalone charges)
  const structuralGaps = gapCodes.filter(
    (g) => g.codeType === "revenue_code" || g.codeType === "c_code"
  );

  return {
    frequentMissingCodes: gapCodes.slice(0, 50),
    codeListExpansionCandidates: expansionCandidates,
    structuralGaps,
    totalUniqueComponentCodes: codeFrequency.size,
    componentCodesByType,
  };
}

// ---------------------------------------------------------------------------
// Data Model Analysis
// ---------------------------------------------------------------------------

interface DataModelInsights {
  componentCountDistribution: {
    min: number;
    max: number;
    median: number;
    p25: number;
    p75: number;
    avg: number;
  };
  facilityComponentDistribution: {
    min: number;
    max: number;
    median: number;
    avg: number;
  };
  associationDistribution: {
    highConfidence: number; // >= 0.7
    moderate: number; // 0.4-0.7
    low: number; // 0.3-0.4
    rare: number; // < 0.3
  };
  codeTypeMix: Map<CodeType, { count: number; avgAssociation: number }>;
}

function analyzeDataModel(episodes: SSPEpisode[]): DataModelInsights {
  const totalComponents = episodes
    .map((e) => e.components.length)
    .sort((a, b) => a - b);
  const facilityComponents = episodes
    .map((e) => e.facilityComponents.length)
    .sort((a, b) => a - b);

  let highConf = 0,
    moderate = 0,
    low = 0,
    rare = 0;
  const codeTypeMix = new Map<
    CodeType,
    { count: number; totalAssoc: number }
  >();

  for (const ep of episodes) {
    for (const comp of ep.components) {
      if (comp.association >= 0.7) highConf++;
      else if (comp.association >= 0.4) moderate++;
      else if (comp.association >= 0.3) low++;
      else rare++;

      const existing = codeTypeMix.get(comp.codeType) || {
        count: 0,
        totalAssoc: 0,
      };
      existing.count++;
      existing.totalAssoc += comp.association;
      codeTypeMix.set(comp.codeType, existing);
    }
  }

  const percentile = (arr: number[], p: number) =>
    arr[Math.floor(arr.length * p)] ?? 0;

  return {
    componentCountDistribution: {
      min: totalComponents[0] ?? 0,
      max: totalComponents[totalComponents.length - 1] ?? 0,
      median: percentile(totalComponents, 0.5),
      p25: percentile(totalComponents, 0.25),
      p75: percentile(totalComponents, 0.75),
      avg:
        totalComponents.length > 0
          ? totalComponents.reduce((a, b) => a + b, 0) / totalComponents.length
          : 0,
    },
    facilityComponentDistribution: {
      min: facilityComponents[0] ?? 0,
      max: facilityComponents[facilityComponents.length - 1] ?? 0,
      median: percentile(facilityComponents, 0.5),
      avg:
        facilityComponents.length > 0
          ? facilityComponents.reduce((a, b) => a + b, 0) /
            facilityComponents.length
          : 0,
    },
    associationDistribution: {
      highConfidence: highConf,
      moderate,
      low,
      rare,
    },
    codeTypeMix: new Map(
      [...codeTypeMix.entries()].map(([k, v]) => [
        k,
        { count: v.count, avgAssociation: v.totalAssoc / v.count },
      ])
    ),
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printResults(
  layer1: Layer1Results,
  layer2: Layer2Results,
  layer3: Layer3Results,
  dataModel: DataModelInsights,
  totalEpisodes: number
) {
  console.log("\n" + "=".repeat(70));
  console.log(
    "SSP DATASET ANALYSIS — Turquoise Health Standard Service Packages"
  );
  console.log("=".repeat(70));

  // --- Layer 1 ---
  console.log("\n--- LAYER 1: SSP Principal Codes vs Our Code List ---\n");
  console.log(`Our codes:            ${layer1.ourCodes.size}`);
  console.log(`SSP principal codes:  ${layer1.sspPrincipalCodes.size}`);
  console.log(
    `Overlap:              ${layer1.overlap.size} (${((layer1.overlap.size / layer1.ourCodes.size) * 100).toFixed(1)}% of ours, ${((layer1.overlap.size / layer1.sspPrincipalCodes.size) * 100).toFixed(1)}% of SSP)`
  );
  console.log(`SSP-only:             ${layer1.sspOnly.size}`);
  console.log(`Our-only:             ${layer1.ourOnly.size}`);

  console.log("\nSSP principal code types:");
  for (const [type, count] of [...layer1.sspPrincipalByType.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type.padEnd(15)} ${count}`);
  }

  console.log("\nOverlap by code type:");
  for (const [type, count] of [...layer1.overlapByCodeType.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type.padEnd(15)} ${count}`);
  }

  console.log("\nSample overlap codes (first 20):");
  console.log(`  ${[...layer1.overlap].sort().slice(0, 20).join(", ")}`);

  // --- Layer 2 ---
  console.log("\n--- LAYER 2: Component Code Charge Coverage (Supabase) ---\n");
  console.log(
    `Unique component codes (facility-tier, overlap episodes): ${layer2.allComponentCodes.size}`
  );
  console.log(
    `Billable codes (CPT/HCPCS):                               ${layer2.allBillableCodes.size}`
  );
  console.log(
    `Codes with Supabase charges:                              ${layer2.priceableCodes.size}`
  );
  console.log(
    `Missing from Supabase:                                    ${layer2.missingCodes.size}`
  );
  console.log(
    `Overall coverage ratio:                                   ${(layer2.overallCoverageRatio * 100).toFixed(1)}%`
  );
  console.log(
    `Median per-episode coverage:                              ${(layer2.medianCoverageRatio * 100).toFixed(1)}%`
  );
  console.log(
    `Episodes with 100% coverage:                              ${layer2.episodesWithFullCoverage}/${layer2.episodeCoverage.length}`
  );
  console.log(
    `Episodes with 0% coverage:                                ${layer2.episodesWithZeroCoverage}/${layer2.episodeCoverage.length}`
  );

  // Show per-episode breakdown for top 15 overlap episodes
  console.log("\nPer-episode coverage (top 15 by component count):");
  const sortedEpisodes = [...layer2.episodeCoverage].sort(
    (a, b) => b.facilityComponents - a.facilityComponents
  );
  for (const ep of sortedEpisodes.slice(0, 15)) {
    console.log(
      `  ${ep.principalCode.padEnd(8)} ${ep.cptHcpcsCodes.length} billable, ${ep.priceableCodes.length} priceable (${(ep.coverageRatio * 100).toFixed(0)}%), ${ep.revenueCodeCount} rev codes`
    );
  }

  // --- Layer 3 ---
  console.log("\n--- LAYER 3: Gap Analysis ---\n");
  console.log(
    `Total unique component codes across all SSPs: ${layer3.totalUniqueComponentCodes}`
  );

  console.log("\nComponent codes by type:");
  for (const [type, count] of [...layer3.componentCodesByType.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type.padEnd(15)} ${count}`);
  }

  console.log(
    `\nCode list expansion candidates (CPT/HCPCS, >=10 episodes, avg assoc>=0.3): ${layer3.codeListExpansionCandidates.length}`
  );
  console.log("Top 20:");
  for (const gap of layer3.codeListExpansionCandidates.slice(0, 20)) {
    console.log(
      `  ${gap.code.padEnd(8)} ${gap.codeType.padEnd(10)} ${gap.episodeCount} episodes, avg assoc ${gap.avgAssociation.toFixed(2)}`
    );
  }

  console.log(
    `\nStructural gaps (revenue/C-codes — not in MRF data model): ${layer3.structuralGaps.length}`
  );
  console.log("Top 10 most common revenue codes:");
  const topRevCodes = layer3.structuralGaps
    .filter((g) => g.codeType === "revenue_code")
    .slice(0, 10);
  for (const gap of topRevCodes) {
    console.log(
      `  ${gap.code.padEnd(8)} ${gap.episodeCount} episodes, avg assoc ${gap.avgAssociation.toFixed(2)}`
    );
  }

  // --- Data Model ---
  console.log("\n--- DATA MODEL INSIGHTS ---\n");
  console.log("Component count distribution (all components, all episodes):");
  const d = dataModel.componentCountDistribution;
  console.log(
    `  Min: ${d.min}, P25: ${d.p25}, Median: ${d.median}, P75: ${d.p75}, Max: ${d.max}, Avg: ${d.avg.toFixed(0)}`
  );

  console.log("\nFacility-tier component count (association >= 0.4):");
  const fd = dataModel.facilityComponentDistribution;
  console.log(
    `  Min: ${fd.min}, Median: ${fd.median}, Max: ${fd.max}, Avg: ${fd.avg.toFixed(0)}`
  );

  console.log("\nAssociation score distribution:");
  const ad = dataModel.associationDistribution;
  const totalAssoc = ad.highConfidence + ad.moderate + ad.low + ad.rare;
  console.log(
    `  High (>=0.7):   ${ad.highConfidence} (${((ad.highConfidence / totalAssoc) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Moderate (0.4-0.7): ${ad.moderate} (${((ad.moderate / totalAssoc) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Low (0.3-0.4):  ${ad.low} (${((ad.low / totalAssoc) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Rare (<0.3):    ${ad.rare} (${((ad.rare / totalAssoc) * 100).toFixed(1)}%)`
  );

  console.log("\nCode type mix in components:");
  for (const [type, stats] of [...dataModel.codeTypeMix.entries()].sort(
    (a, b) => b[1].count - a[1].count
  )) {
    console.log(
      `  ${type.padEnd(15)} ${stats.count} occurrences, avg assoc ${stats.avgAssociation.toFixed(2)}`
    );
  }

  console.log("\n" + "=".repeat(70));
  console.log("ANALYSIS COMPLETE");
  console.log("=".repeat(70));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Loading SSP dataset...");
  const episodes = loadAllSSPEpisodes();
  console.log(`  Loaded ${episodes.length} SSP episodes from ${SSP_DIR}`);

  console.log("Loading ClearCost code list...");
  const ourCodesArray: string[] = JSON.parse(
    readFileSync(CODE_LIST_PATH, "utf-8")
  );
  const ourCodes = new Set(ourCodesArray);
  console.log(`  Loaded ${ourCodes.size} codes from ${CODE_LIST_PATH}`);

  console.log("\nRunning Layer 1: SSP vs Code List...");
  const layer1 = analyzeLayer1(episodes, ourCodes);

  // Filter to overlap episodes for Layer 2
  const overlapEpisodes = episodes.filter((ep) =>
    ourCodes.has(ep.principalCode)
  );
  console.log(
    `\nRunning Layer 2: Component coverage (${overlapEpisodes.length} overlap episodes)...`
  );
  const layer2 = await analyzeLayer2(episodes, overlapEpisodes);

  console.log("\nRunning Layer 3: Gap analysis...");
  const layer3 = analyzeLayer3(episodes, ourCodes);

  console.log("Analyzing data model implications...");
  const dataModel = analyzeDataModel(episodes);

  printResults(layer1, layer2, layer3, dataModel, episodes.length);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
