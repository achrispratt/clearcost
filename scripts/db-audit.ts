/**
 * Comprehensive Supabase data-quality audit for ClearCost.
 *
 * Uses server-side RPC functions for all heavy aggregation (GROUP BY inside Postgres)
 * instead of thousands of individual REST API calls. Runs in ~10-30 seconds.
 *
 * Prerequisites: Run supabase/migrations/20260301_audit_rpcs.sql first.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/db-audit.ts
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Severity = "CRITICAL" | "WARNING" | "INFO";

interface ProviderRow {
  id: string;
  name: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
}

interface StateChargeSummary {
  state: string;
  providerCount: number;
  providersWithCharges: number;
  providersWithoutCharges: number;
}

interface DuplicateExample {
  providerId: string;
  providerName: string;
  code: string;
  cashPrice: string;
  occurrences: number;
}

interface DuplicateSummary {
  sampledProviders: number;
  suspectedDuplicateGroups: number;
  suspectedDuplicateRows: number;
  examples: DuplicateExample[];
}

interface PrioritizedIssue {
  severity: Severity;
  title: string;
  impactCount: number;
  detail: string;
  recommendation: string;
}

const PROVIDER_PAGE_SIZE = 1000;
const DUPLICATE_SAMPLE_PROVIDER_LIMIT = 120;
const DUPLICATE_EXAMPLE_LIMIT = 20;

const VALID_STATE_CODES = new Set<string>([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
]);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString();
}

function logProgress(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function fmtPct(numerator: number, denominator: number): string {
  return `${toPercent(numerator, denominator).toFixed(2)}%`;
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

function normalizeState(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.toUpperCase();
}

function isRecognizedState(value: string | null): boolean {
  const normalized = normalizeState(value);
  return normalized !== null && VALID_STATE_CODES.has(normalized);
}

function stateBucket(value: string | null): string {
  const normalized = normalizeState(value);
  if (normalized === null) return "UNKNOWN(NULL/EMPTY)";
  if (VALID_STATE_CODES.has(normalized)) return normalized;
  return `UNKNOWN(${normalized})`;
}

function rawStateLabel(value: string | null): string {
  if (value === null) return "(NULL)";
  if (value === "") return "(EMPTY)";
  return value;
}

function providerLabel(provider: ProviderRow): string {
  const name = provider.name?.trim() ? provider.name : "(unnamed provider)";
  return `${name} [${provider.id}]`;
}

function severityRank(severity: Severity): number {
  if (severity === "CRITICAL") return 3;
  if (severity === "WARNING") return 2;
  return 1;
}

function keySortDescending<T extends { severity: Severity; impactCount: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const severityDiff = severityRank(b.severity) - severityRank(a.severity);
    if (severityDiff !== 0) return severityDiff;
    return b.impactCount - a.impactCount;
  });
}

// ---------------------------------------------------------------------------
// Data loading (unchanged — small tables, paginated REST is fine)
// ---------------------------------------------------------------------------

async function fetchAllProviders(client: SupabaseClient): Promise<ProviderRow[]> {
  logProgress("Loading providers (paginated)...");
  const providers: ProviderRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("providers")
      .select("id,name,state,city,address,zip,lat,lng")
      .order("id", { ascending: true })
      .range(offset, offset + PROVIDER_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed fetching providers at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;
    providers.push(...(data as ProviderRow[]));
    offset += data.length;
    logProgress(`Loaded ${providers.length} providers so far...`);
    if (data.length < PROVIDER_PAGE_SIZE) break;
  }
  logProgress(`Provider load complete: ${providers.length} rows`);
  return providers;
}

async function countRows(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed counting ${table}: ${error.message}`);
  return count ?? 0;
}

async function loadCuratedCodes(): Promise<string[]> {
  const path = resolve(process.cwd(), "lib/data/final-codes.json");
  const contents = await readFile(path, "utf-8");
  const parsed = JSON.parse(contents) as unknown;
  if (!Array.isArray(parsed)) throw new Error("lib/data/final-codes.json is not an array");
  const codes = parsed.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return Array.from(new Set(codes.map((c) => c.trim().toUpperCase())));
}

function groupProvidersByState(providers: ProviderRow[]): Map<string, ProviderRow[]> {
  const grouped = new Map<string, ProviderRow[]>();
  for (const provider of providers) {
    const bucket = stateBucket(provider.state);
    const existing = grouped.get(bucket) ?? [];
    existing.push(provider);
    grouped.set(bucket, existing);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Severity calculations (unchanged)
// ---------------------------------------------------------------------------

function severityForMissingStateCharges(statesWithMissing: StateChargeSummary[]): Severity {
  const fullyEmptyStates = statesWithMissing.filter((s) => s.providersWithCharges === 0);
  if (fullyEmptyStates.length > 0) return "CRITICAL";
  if (statesWithMissing.length > 0) return "WARNING";
  return "INFO";
}

function severityForMissingAddresses(count: number): Severity {
  return count > 0 ? "WARNING" : "INFO";
}

function severityForMissingGeocode(count: number): Severity {
  return count > 0 ? "CRITICAL" : "INFO";
}

function severityForUnknownStateProviders(providers: ProviderRow[], withCharges: number): Severity {
  if (withCharges > 0) return "CRITICAL";
  if (providers.length > 0) return "WARNING";
  return "INFO";
}

function severityForOrphanCharges(count: number): Severity {
  return count > 0 ? "CRITICAL" : "INFO";
}

function severityForZeroPriceCharges(pct: number): Severity {
  if (pct >= 30) return "CRITICAL";
  if (pct >= 5) return "WARNING";
  return "INFO";
}

function severityForLowChargeProviders(lowCount: number, totalProviders: number): Severity {
  if (lowCount === 0) return "INFO";
  if (toPercent(lowCount, totalProviders) >= 5) return "CRITICAL";
  return "WARNING";
}

function severityForCodeCoverage(zeroCount: number, totalCodes: number): Severity {
  if (toPercent(zeroCount, totalCodes) >= 10) return "CRITICAL";
  if (zeroCount > 0) return "WARNING";
  return "INFO";
}

function severityForDuplicateSample(duplicateRows: number): Severity {
  return duplicateRows > 0 ? "WARNING" : "INFO";
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startedAt = Date.now();
  logProgress("Starting Supabase DB health audit (RPC-optimized)");

  // Phase 0: Setup — load small datasets
  logProgress("Counting top-level table sizes...");
  const [totalCharges, totalPayerRates] = await Promise.all([
    countRows(supabase, "charges"),
    countRows(supabase, "payer_rates"),
  ]);
  logProgress(`Top-level counts: charges=${totalCharges.toLocaleString()}, payer_rates=${totalPayerRates.toLocaleString()}`);

  const providers = await fetchAllProviders(supabase);
  const totalProviders = providers.length;
  const curatedCodes = await loadCuratedCodes();

  // Phase 1: Parallel RPCs — all independent aggregations at once
  logProgress("Running parallel audit RPCs (provider counts, zero-price, orphans, code coverage)...");
  const [
    providerCountsResult,
    zeroPriceResult,
    orphanResult,
    codeCoverageResult,
  ] = await Promise.all([
    supabase.rpc("audit_provider_charge_counts"),
    supabase.rpc("audit_zero_price_by_state"),
    supabase.rpc("audit_orphan_charges"),
    supabase.rpc("audit_code_coverage", { p_codes: curatedCodes }),
  ]);

  if (providerCountsResult.error) throw new Error(`audit_provider_charge_counts failed: ${providerCountsResult.error.message}`);
  if (zeroPriceResult.error) throw new Error(`audit_zero_price_by_state failed: ${zeroPriceResult.error.message}`);
  if (orphanResult.error) throw new Error(`audit_orphan_charges failed: ${orphanResult.error.message}`);
  if (codeCoverageResult.error) throw new Error(`audit_code_coverage failed: ${codeCoverageResult.error.message}`);

  logProgress("Phase 1 RPCs complete");

  // Build provider charge count map
  const providerChargeCounts = new Map<string, number>();
  for (const row of (providerCountsResult.data ?? []) as Array<{ provider_id: string; charge_count: number }>) {
    providerChargeCounts.set(row.provider_id, Number(row.charge_count));
  }
  for (const provider of providers) {
    if (!providerChargeCounts.has(provider.id)) {
      providerChargeCounts.set(provider.id, 0);
    }
  }

  // Build zero-price by state map
  const zeroPriceByState = new Map<string, number>();
  let totalZeroPriceCharges = 0;
  for (const row of (zeroPriceResult.data ?? []) as Array<{ state: string; zero_price_count: number }>) {
    const count = Number(row.zero_price_count);
    zeroPriceByState.set(row.state, count);
    totalZeroPriceCharges += count;
  }
  const zeroPricePercent = toPercent(totalZeroPriceCharges, totalCharges);

  // Orphan charges
  const orphanCharges = Number(orphanResult.data) || 0;

  // Code coverage
  const zeroCoverageCodes: string[] = [];
  for (const row of (codeCoverageResult.data ?? []) as Array<{ code: string; match_count: number }>) {
    if (Number(row.match_count) === 0) {
      zeroCoverageCodes.push(row.code);
    }
  }
  zeroCoverageCodes.sort();

  // Phase 2: Duplicate detection (depends on provider counts from Phase 1)
  // Small batches (5 providers) to stay within the 8s Supabase statement timeout.
  // Timeouts are non-fatal — we report partial results and skip failed batches.
  const DUPLICATE_BATCH_SIZE = 5;
  const topProviderIds = providers
    .filter((p) => (providerChargeCounts.get(p.id) ?? 0) > 0)
    .sort((a, b) => (providerChargeCounts.get(b.id) ?? 0) - (providerChargeCounts.get(a.id) ?? 0))
    .slice(0, DUPLICATE_SAMPLE_PROVIDER_LIMIT)
    .map((p) => p.id);

  const totalBatches = Math.ceil(topProviderIds.length / DUPLICATE_BATCH_SIZE);
  logProgress(`Running duplicate detection RPC (top ${topProviderIds.length} providers in ${totalBatches} batches of ${DUPLICATE_BATCH_SIZE})...`);

  type DuplicateRow = {
    provider_id: string;
    provider_name: string | null;
    code_value: string;
    cash_price: number | null;
    occurrences: number;
  };
  const allDuplicateRows: DuplicateRow[] = [];
  let duplicateBatchFailures = 0;

  for (let i = 0; i < topProviderIds.length; i += DUPLICATE_BATCH_SIZE) {
    const batch = topProviderIds.slice(i, i + DUPLICATE_BATCH_SIZE);
    const batchNum = Math.floor(i / DUPLICATE_BATCH_SIZE) + 1;
    const result = await supabase.rpc("audit_duplicate_charges", { p_provider_ids: batch });
    if (result.error) {
      duplicateBatchFailures++;
      logProgress(`Duplicate batch ${batchNum}/${totalBatches} timed out (${batch.length} providers skipped)`);
      continue;
    }
    allDuplicateRows.push(...((result.data ?? []) as DuplicateRow[]));
    logProgress(`Duplicate batch ${batchNum}/${totalBatches} complete`);
  }

  // Sort all results by occurrences desc (each batch was individually sorted)
  allDuplicateRows.sort((a, b) => Number(b.occurrences) - Number(a.occurrences));

  const duplicateSample: DuplicateSummary = {
    sampledProviders: topProviderIds.length,
    suspectedDuplicateGroups: 0,
    suspectedDuplicateRows: 0,
    examples: [],
  };
  for (const row of allDuplicateRows) {
    duplicateSample.suspectedDuplicateGroups += 1;
    duplicateSample.suspectedDuplicateRows += Number(row.occurrences) - 1;
    if (duplicateSample.examples.length < DUPLICATE_EXAMPLE_LIMIT) {
      duplicateSample.examples.push({
        providerId: row.provider_id,
        providerName: row.provider_name ?? "(unnamed provider)",
        code: row.code_value,
        cashPrice: row.cash_price === null ? "NULL" : String(row.cash_price),
        occurrences: Number(row.occurrences),
      });
    }
  }
  logProgress("Phase 2 duplicate detection complete");

  // ---------------------------------------------------------------------------
  // In-memory analysis (unchanged from original)
  // ---------------------------------------------------------------------------

  // 1) Missing charge data by state
  const stateChargeStats = new Map<string, { providerCount: number; providersWithCharges: number }>();
  for (const provider of providers) {
    const bucket = stateBucket(provider.state);
    const entry = stateChargeStats.get(bucket) ?? { providerCount: 0, providersWithCharges: 0 };
    entry.providerCount += 1;
    if ((providerChargeCounts.get(provider.id) ?? 0) > 0) {
      entry.providersWithCharges += 1;
    }
    stateChargeStats.set(bucket, entry);
  }

  const stateChargeSummaries: StateChargeSummary[] = Array.from(stateChargeStats.entries())
    .map(([state, counts]) => ({
      state,
      providerCount: counts.providerCount,
      providersWithCharges: counts.providersWithCharges,
      providersWithoutCharges: counts.providerCount - counts.providersWithCharges,
    }))
    .sort((a, b) => {
      if (b.providersWithoutCharges !== a.providersWithoutCharges) {
        return b.providersWithoutCharges - a.providersWithoutCharges;
      }
      return b.providerCount - a.providerCount;
    });

  const statesWithMissingCharges = stateChargeSummaries.filter((s) => s.providersWithoutCharges > 0);
  const fullyEmptyStates = stateChargeSummaries.filter((s) => s.providerCount > 0 && s.providersWithCharges === 0);
  const totalProvidersWithoutCharges = statesWithMissingCharges.reduce((sum, s) => sum + s.providersWithoutCharges, 0);

  // 2) Missing provider addresses
  const missingAddressProviders = providers.filter(
    (p) => isBlank(p.city) || isBlank(p.address) || isBlank(p.zip)
  );
  const missingAddressByState = groupProvidersByState(missingAddressProviders);

  // 3) Missing geocoding
  const missingGeocodeProviders = providers.filter((p) => p.lat === null || p.lng === null);
  const missingGeocodeByState = groupProvidersByState(missingGeocodeProviders);

  // 4) Unknown/unrecognized state providers
  const unknownStateProviders = providers.filter((p) => !isRecognizedState(p.state));
  const unknownStateProvidersWithCharges = unknownStateProviders.filter(
    (p) => (providerChargeCounts.get(p.id) ?? 0) > 0
  );

  // 7) Providers with very low charge counts (<10 and >0)
  const lowChargeProviders = providers.filter((p) => {
    const count = providerChargeCounts.get(p.id) ?? 0;
    return count > 0 && count < 10;
  });
  const lowChargeProvidersByState = groupProvidersByState(lowChargeProviders);

  // ---------------------------------------------------------------------------
  // Severity calculations
  // ---------------------------------------------------------------------------

  const severityMissingChargeByState = severityForMissingStateCharges(statesWithMissingCharges);
  const severityMissingAddresses = severityForMissingAddresses(missingAddressProviders.length);
  const severityMissingGeocoding = severityForMissingGeocode(missingGeocodeProviders.length);
  const severityUnknownStates = severityForUnknownStateProviders(
    unknownStateProviders,
    unknownStateProvidersWithCharges.length
  );
  const severityOrphans = severityForOrphanCharges(orphanCharges);
  const severityZeroPrice = severityForZeroPriceCharges(zeroPricePercent);
  const severityLowChargeProviders = severityForLowChargeProviders(lowChargeProviders.length, totalProviders);
  const severityCodeCoverage = severityForCodeCoverage(zeroCoverageCodes.length, curatedCodes.length);
  const severityDuplicates = severityForDuplicateSample(duplicateSample.suspectedDuplicateRows);

  // ---------------------------------------------------------------------------
  // Prioritized issues
  // ---------------------------------------------------------------------------

  const prioritizedIssues: PrioritizedIssue[] = [];

  if (fullyEmptyStates.length > 0) {
    prioritizedIssues.push({
      severity: "CRITICAL",
      title: "States with zero charge coverage",
      impactCount: fullyEmptyStates.reduce((sum, s) => sum + s.providerCount, 0),
      detail: fullyEmptyStates
        .map((s) => `${s.state} (${s.providerCount} providers, 0 with charges)`)
        .join("; "),
      recommendation: "Re-run or backfill charge import for these states first, then re-audit coverage.",
    });
  }

  if (missingGeocodeProviders.length > 0) {
    prioritizedIssues.push({
      severity: "CRITICAL",
      title: "Providers missing coordinates",
      impactCount: missingGeocodeProviders.length,
      detail: `${missingGeocodeProviders.length} providers have NULL lat/lng and are excluded from ST_DWithin search.`,
      recommendation: "Backfill geocoding for all providers with NULL lat/lng and monitor geocode success rates per state.",
    });
  }

  if (unknownStateProvidersWithCharges.length > 0) {
    prioritizedIssues.push({
      severity: "CRITICAL",
      title: "Charge-bearing providers with unknown state",
      impactCount: unknownStateProvidersWithCharges.length,
      detail: `${unknownStateProvidersWithCharges.length} providers have charges but unrecognized/null state values.`,
      recommendation: "Normalize provider.state values so geographically scoped queries can reach these charges.",
    });
  }

  if (orphanCharges > 0) {
    prioritizedIssues.push({
      severity: "CRITICAL",
      title: "Orphan charges",
      impactCount: orphanCharges,
      detail: `${orphanCharges.toLocaleString()} charges reference provider_id values that do not match providers.id.`,
      recommendation: "Reconcile provider_id integrity and enforce FK consistency in import pipeline.",
    });
  }

  if (totalZeroPriceCharges > 0) {
    prioritizedIssues.push({
      severity: severityZeroPrice,
      title: "Price-unavailable charge rows",
      impactCount: totalZeroPriceCharges,
      detail: `${totalZeroPriceCharges.toLocaleString()} charges (${zeroPricePercent.toFixed(2)}%) have all pricing fields NULL.`,
      recommendation: "Investigate pricing parser coverage and fill core pricing columns where available.",
    });
  }

  if (lowChargeProviders.length > 0) {
    prioritizedIssues.push({
      severity: severityLowChargeProviders,
      title: "Providers with low charge counts (<10)",
      impactCount: lowChargeProviders.length,
      detail: `${lowChargeProviders.length} providers have partial-looking imports (1-9 charges).`,
      recommendation: "Audit source files for low-count providers and re-run failed/partial imports.",
    });
  }

  if (missingAddressProviders.length > 0) {
    prioritizedIssues.push({
      severity: severityMissingAddresses,
      title: "Providers missing address fields",
      impactCount: missingAddressProviders.length,
      detail: `${missingAddressProviders.length} providers are missing city/address/zip and may fail geocoding.`,
      recommendation: "Complete missing address fields before geocode jobs and add input validation.",
    });
  }

  if (zeroCoverageCodes.length > 0) {
    prioritizedIssues.push({
      severity: severityCodeCoverage,
      title: "Curated billing codes with zero coverage",
      impactCount: zeroCoverageCodes.length,
      detail: `${zeroCoverageCodes.length}/${curatedCodes.length} curated codes have zero matching charges (CPT/HCPCS).`,
      recommendation: "Review code list alignment with imported data and adjust ingestion filters or curated list.",
    });
  }

  if (duplicateSample.suspectedDuplicateRows > 0) {
    prioritizedIssues.push({
      severity: severityDuplicates,
      title: "Suspected duplicate charges (sample)",
      impactCount: duplicateSample.suspectedDuplicateRows,
      detail: `${duplicateSample.suspectedDuplicateRows} duplicate rows across ${duplicateSample.suspectedDuplicateGroups} groups in sampled data.`,
      recommendation: "Add dedupe rules on provider+code+cash_price+description during import/upsert.",
    });
  }

  const orderedIssues = keySortDescending(prioritizedIssues);

  // ---------------------------------------------------------------------------
  // Console report
  // ---------------------------------------------------------------------------

  console.log("\n========== ClearCost Supabase Data Quality Audit ==========");
  console.log(`Generated at: ${new Date().toISOString()}`);
  console.log(`Runtime: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`Providers scanned: ${totalProviders.toLocaleString()}`);
  console.log(`Charges (total): ${totalCharges.toLocaleString()}`);
  console.log(`Payer rates (total): ${totalPayerRates.toLocaleString()}`);

  console.log("\n--- 1) Missing Charge Data by State ---");
  for (const state of stateChargeSummaries) {
    console.log(
      `- ${state.state}: providers=${state.providerCount}, with_charges=${state.providersWithCharges}, without_charges=${state.providersWithoutCharges} (${fmtPct(
        state.providersWithoutCharges,
        state.providerCount
      )} missing)`
    );
  }
  const njState = stateChargeSummaries.find((s) => s.state === "NJ");
  const paState = stateChargeSummaries.find((s) => s.state === "PA");
  if (njState) {
    console.log(
      `  NJ check: providers=${njState.providerCount}, with_charges=${njState.providersWithCharges}, without_charges=${njState.providersWithoutCharges}`
    );
  }
  if (paState) {
    console.log(
      `  PA check: providers=${paState.providerCount}, with_charges=${paState.providersWithCharges}, without_charges=${paState.providersWithoutCharges}`
    );
  }

  console.log("\n--- 2) Missing Provider Addresses (city/address/zip is NULL or empty) ---");
  for (const [state, providersInState] of Array.from(missingAddressByState.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`- ${state}: ${providersInState.length}`);
    for (const provider of providersInState) {
      const missingFields: string[] = [];
      if (isBlank(provider.city)) missingFields.push("city");
      if (isBlank(provider.address)) missingFields.push("address");
      if (isBlank(provider.zip)) missingFields.push("zip");
      console.log(`  - ${providerLabel(provider)} | missing=${missingFields.join(",")}`);
    }
  }

  console.log("\n--- 3) Missing Geocoding (lat/lng is NULL) ---");
  for (const [state, providersInState] of Array.from(missingGeocodeByState.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`- ${state}: ${providersInState.length}`);
    for (const provider of providersInState) {
      const missingFields: string[] = [];
      if (provider.lat === null) missingFields.push("lat");
      if (provider.lng === null) missingFields.push("lng");
      console.log(`  - ${providerLabel(provider)} | missing=${missingFields.join(",")}`);
    }
  }

  console.log("\n--- 4) Unknown/Unrecognized State Providers ---");
  console.log(`Total unknown providers: ${unknownStateProviders.length}`);
  console.log(`Unknown providers with >=1 charge: ${unknownStateProvidersWithCharges.length}`);
  for (const provider of unknownStateProviders) {
    const chargeCount = providerChargeCounts.get(provider.id) ?? 0;
    console.log(
      `- state=${rawStateLabel(provider.state)} | charges=${chargeCount} | ${providerLabel(provider)}`
    );
  }

  console.log("\n--- 5) Orphan Charges ---");
  console.log(`- orphan_charges: ${orphanCharges.toLocaleString()}`);

  console.log("\n--- 6) Zero-Price Charges ---");
  console.log(
    `- total_zero_price_charges: ${totalZeroPriceCharges.toLocaleString()} / ${totalCharges.toLocaleString()} (${zeroPricePercent.toFixed(
      2
    )}%)`
  );
  for (const [state, count] of Array.from(zeroPriceByState.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${state}: ${count.toLocaleString()}`);
  }

  console.log("\n--- 7) Providers with Very Low Charge Counts (1-9) ---");
  console.log(`Total providers with 1-9 charges: ${lowChargeProviders.length}`);
  for (const [state, providersInState] of Array.from(lowChargeProvidersByState.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`- ${state}: ${providersInState.length}`);
    for (const provider of providersInState) {
      const count = providerChargeCounts.get(provider.id) ?? 0;
      console.log(`  - charges=${count} | ${providerLabel(provider)}`);
    }
  }

  console.log("\n--- 8) Curated Code Coverage (final-codes.json) ---");
  console.log(`Curated codes: ${curatedCodes.length}`);
  console.log(`Codes with zero charges: ${zeroCoverageCodes.length}`);
  if (zeroCoverageCodes.length > 0) {
    console.log(`- zero_coverage_codes: ${zeroCoverageCodes.join(", ")}`);
  }

  console.log("\n--- 9) Potential Duplicate Charges (RPC-based) ---");
  console.log(`Sampled providers (top by charge count): ${duplicateSample.sampledProviders}`);
  if (duplicateBatchFailures > 0) {
    console.log(`Batch timeouts: ${duplicateBatchFailures}/${totalBatches} (results are partial — heaviest providers skipped)`);
  }
  console.log(`Suspected duplicate groups: ${duplicateSample.suspectedDuplicateGroups.toLocaleString()}`);
  console.log(`Suspected duplicate rows: ${duplicateSample.suspectedDuplicateRows.toLocaleString()}`);
  for (const example of duplicateSample.examples) {
    console.log(
      `- provider=${example.providerName} [${example.providerId}] | code=${example.code} | cash_price=${example.cashPrice} | occurrences=${example.occurrences}`
    );
  }

  console.log("\n--- Prioritized Issues to Fix ---");
  if (orderedIssues.length === 0) {
    console.log("- No high-signal issues were detected by this audit run.");
  } else {
    for (let i = 0; i < orderedIssues.length; i += 1) {
      const issue = orderedIssues[i];
      console.log(
        `${i + 1}. [${issue.severity}] ${issue.title} | impact=${issue.impactCount.toLocaleString()} | ${issue.detail}`
      );
      console.log(`   recommendation: ${issue.recommendation}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Structured JSON summary
  // ---------------------------------------------------------------------------

  const structuredSummary = {
    generatedAt: new Date().toISOString(),
    runtimeSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    totals: {
      providers: totalProviders,
      charges: totalCharges,
      payerRates: totalPayerRates,
      statesInProviders: stateChargeSummaries.length,
      statesWithMissingCharges: statesWithMissingCharges.length,
      providersWithoutCharges: totalProvidersWithoutCharges,
      missingAddressProviders: missingAddressProviders.length,
      missingGeocodeProviders: missingGeocodeProviders.length,
      unknownStateProviders: unknownStateProviders.length,
      unknownStateProvidersWithCharges: unknownStateProvidersWithCharges.length,
      orphanCharges,
      zeroPriceCharges: totalZeroPriceCharges,
      zeroPriceChargesPercent: zeroPricePercent,
      lowChargeProviders: lowChargeProviders.length,
      curatedCodes: curatedCodes.length,
      curatedCodesWithZeroCharges: zeroCoverageCodes.length,
      suspectedDuplicateGroupsSample: duplicateSample.suspectedDuplicateGroups,
      suspectedDuplicateRowsSample: duplicateSample.suspectedDuplicateRows,
    },
    severities: {
      missingChargeDataByState: severityMissingChargeByState,
      missingProviderAddresses: severityMissingAddresses,
      missingGeocoding: severityMissingGeocoding,
      unknownStateProviders: severityUnknownStates,
      orphanCharges: severityOrphans,
      zeroPriceCharges: severityZeroPrice,
      providersWithLowChargeCounts: severityLowChargeProviders,
      chargeCodeCoverage: severityCodeCoverage,
      duplicateChargesSample: severityDuplicates,
    },
    prioritizedIssues: orderedIssues,
    performanceNotes: {
      mode: "rpc-optimized",
      rpcCalls: 5,
      parallelPhase1: ["audit_provider_charge_counts", "audit_zero_price_by_state", "audit_orphan_charges", "audit_code_coverage"],
      sequentialPhase2: ["audit_duplicate_charges"],
      duplicateSampleProviderLimit: DUPLICATE_SAMPLE_PROVIDER_LIMIT,
    },
    spotChecks: {
      nj: njState ? { providers: njState.providerCount, withCharges: njState.providersWithCharges, withoutCharges: njState.providersWithoutCharges } : null,
      pa: paState ? { providers: paState.providerCount, withCharges: paState.providersWithCharges, withoutCharges: paState.providersWithoutCharges } : null,
    },
  };

  console.log("\n========== Structured Summary ==========");
  console.log(JSON.stringify(structuredSummary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp()}] Audit failed: ${message}`);
  process.exit(1);
});
