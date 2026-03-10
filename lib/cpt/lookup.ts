import { createClient } from "@/lib/supabase/server";
import { milesToKm, kmToMiles } from "@/lib/units";
// @ts-expect-error zipcodes has no bundled TypeScript declarations.
import zipcodes from "zipcodes";
import type {
  BodySite,
  ChargeResult,
  BillingCodeType,
  Laterality,
  OptionalAdderEstimate,
  OptionalAdderType,
  PlannedAdder,
  PricingPlan,
} from "@/types";

interface LookupFilters {
  laterality?: Laterality;
  bodySite?: BodySite;
}

interface LookupParams {
  codes: string[];
  codeType?: BillingCodeType;
  lat: number;
  lng: number;
  radiusMiles?: number;
  limit?: number;
  providerLimit?: number;
  laterality?: Laterality;
  bodySite?: BodySite;
}

interface FallbackLookupParams {
  searchTerms: string;
  lat: number;
  lng: number;
  radiusMiles?: number;
  limit?: number;
  providerLimit?: number;
}

interface PriceSummary {
  estimatePrice: number;
  minPrice: number;
  maxPrice: number;
}

interface ProviderAdderSummary {
  providerSummaries: Map<string, PriceSummary>;
  localSummary?: PriceSummary;
}

interface LookupWithPlanParams {
  pricingPlan: PricingPlan;
  lat: number;
  lng: number;
  radiusMiles?: number;
  descriptionFallback?: string;
  diagnostics?: LookupDiagnostics;
}

interface LookupStageCounterSnapshot {
  attempts: number;
  retries: number;
  timeouts: number;
  failures: number;
  chunkFallbacks: number;
}

export interface LookupStageSummary {
  stage: string;
  initialResults: number;
  expandedResults: number;
  descriptionResults: number;
  usedExpandedRadius: boolean;
  usedDescriptionFallback: boolean;
  exhausted: boolean;
  attempts: number;
  retries: number;
  timeouts: number;
  failures: number;
  chunkFallbacks: number;
}

export interface LookupDiagnostics {
  totalRpcAttempts: number;
  totalRetries: number;
  totalTimeouts: number;
  totalFailures: number;
  totalChunkFallbacks: number;
  fallbackExhausted: boolean;
  stageSummaries: LookupStageSummary[];
}

interface RpcExecutionResult<RowType> {
  rows: RowType[];
  attempts: number;
  retries: number;
  timeouts: number;
  failures: number;
  timedOut: boolean;
  errorCode?: string;
  errorMessage?: string;
}

interface RpcExecutionContext {
  diagnostics?: LookupDiagnostics;
  stage?: string;
}

const ENCOUNTER_LABELS: Record<
  NonNullable<PricingPlan["encounterType"]>,
  string
> = {
  emergency: "Emergency room visit estimate",
  office: "Visit estimate",
  specialist: "Specialist visit estimate",
  urgent_care_proxy: "Urgent care visit estimate (office E/M proxy)",
};

const MAX_PROVIDER_ZIP_DRIFT_MILES = 75;
const DISTANCE_FILTER_TOLERANCE_MILES = 0.5;
const RPC_TIMEOUT_CODE = "57014";
const RPC_MAX_RETRIES = 2;
const RPC_RETRY_DELAYS_MS = [120, 320];
const CODE_CHUNK_FALLBACK_SIZE = 4;
const CODE_LOOKUP_LIMIT = 600;
const DESCRIPTION_LOOKUP_LIMIT = 120;
const PROVIDER_LIMIT = 300;

export function createLookupDiagnostics(): LookupDiagnostics {
  return {
    totalRpcAttempts: 0,
    totalRetries: 0,
    totalTimeouts: 0,
    totalFailures: 0,
    totalChunkFallbacks: 0,
    fallbackExhausted: false,
    stageSummaries: [],
  };
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function haversineMiles(
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number
): number {
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(targetLat - originLat);
  const lngDelta = toRadians(targetLng - originLng);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(targetLat)) *
      Math.sin(lngDelta / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeZip(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1];
}

function extractStateAwareZip(
  address: string | undefined,
  state: string | undefined
): string | undefined {
  if (!address) return undefined;

  const normalizedState = state?.trim().toUpperCase();
  if (normalizedState && normalizedState.length === 2) {
    const scopedMatch = address
      .toUpperCase()
      .match(
        new RegExp(
          `\\b${escapeRegex(normalizedState)}\\s+(\\d{5})(?:-\\d{4})?\\b`
        )
      );
    if (scopedMatch?.[1]) return scopedMatch[1];
  }

  const trailingMatch = address.match(/(\d{5})(?:-\d{4})?\s*$/);
  return trailingMatch?.[1];
}

function lookupZipCoordinates(
  zip: string | undefined
): { lat: number; lng: number } | undefined {
  if (!zip) return undefined;

  const match = zipcodes.lookup(zip) as {
    latitude?: number;
    longitude?: number;
  } | null;

  if (match?.latitude == null || match?.longitude == null) return undefined;
  return { lat: match.latitude, lng: match.longitude };
}

function resolveProviderCoordinates(result: ChargeResult): {
  lat: number | undefined;
  lng: number | undefined;
} {
  const providerLat = result.provider.lat;
  const providerLng = result.provider.lng;
  const zipFromAddress = extractStateAwareZip(
    result.provider.address,
    result.provider.state
  );
  const zipFromProvider = normalizeZip(result.provider.zip);
  const zipCoordinates = lookupZipCoordinates(
    zipFromAddress || zipFromProvider
  );

  if (!zipCoordinates) {
    return { lat: providerLat, lng: providerLng };
  }

  if (providerLat == null || providerLng == null) {
    return zipCoordinates;
  }

  const driftMiles = haversineMiles(
    providerLat,
    providerLng,
    zipCoordinates.lat,
    zipCoordinates.lng
  );

  if (driftMiles > MAX_PROVIDER_ZIP_DRIFT_MILES) {
    return zipCoordinates;
  }

  return { lat: providerLat, lng: providerLng };
}

function normalizeAndRankResults({
  results,
  userLat,
  userLng,
  maxRadiusMiles,
}: {
  results: ChargeResult[];
  userLat: number;
  userLng: number;
  maxRadiusMiles: number;
}): ChargeResult[] {
  const normalizedResults: ChargeResult[] = [];

  for (const result of results) {
    const coordinates = resolveProviderCoordinates(result);
    const latValue = coordinates.lat;
    const lngValue = coordinates.lng;

    let recomputedDistanceMiles = result.distanceMiles;
    if (
      typeof latValue === "number" &&
      Number.isFinite(latValue) &&
      typeof lngValue === "number" &&
      Number.isFinite(lngValue)
    ) {
      recomputedDistanceMiles = haversineMiles(
        userLat,
        userLng,
        latValue,
        lngValue
      );
    }

    if (
      recomputedDistanceMiles != null &&
      Number.isFinite(recomputedDistanceMiles) &&
      recomputedDistanceMiles > maxRadiusMiles + DISTANCE_FILTER_TOLERANCE_MILES
    ) {
      continue;
    }

    const nextDistanceMiles =
      recomputedDistanceMiles != null &&
      Number.isFinite(recomputedDistanceMiles)
        ? recomputedDistanceMiles
        : result.distanceMiles;
    const nextDistanceKm =
      nextDistanceMiles != null && Number.isFinite(nextDistanceMiles)
        ? milesToKm(nextDistanceMiles)
        : result.distanceKm;

    const provider = { ...result.provider };
    if (coordinates.lat != null) {
      provider.lat = coordinates.lat;
    } else {
      delete provider.lat;
    }
    if (coordinates.lng != null) {
      provider.lng = coordinates.lng;
    } else {
      delete provider.lng;
    }

    normalizedResults.push({
      ...result,
      provider,
      distanceMiles: nextDistanceMiles,
      distanceKm: nextDistanceKm,
    });
  }

  return normalizedResults.sort((a, b) => {
    const distanceA =
      a.distanceMiles != null && Number.isFinite(a.distanceMiles)
        ? a.distanceMiles
        : Infinity;
    const distanceB =
      b.distanceMiles != null && Number.isFinite(b.distanceMiles)
        ? b.distanceMiles
        : Infinity;

    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    const priceA = a.estimatedTotalMedian ?? a.cashPrice ?? Infinity;
    const priceB = b.estimatedTotalMedian ?? b.cashPrice ?? Infinity;
    if (priceA !== priceB) {
      return priceA - priceB;
    }

    return a.provider.name.localeCompare(b.provider.name);
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutCode(code: string | undefined): boolean {
  return code === RPC_TIMEOUT_CODE;
}

function diagnosticsSnapshot(
  diagnostics: LookupDiagnostics | undefined
): LookupStageCounterSnapshot {
  return {
    attempts: diagnostics?.totalRpcAttempts || 0,
    retries: diagnostics?.totalRetries || 0,
    timeouts: diagnostics?.totalTimeouts || 0,
    failures: diagnostics?.totalFailures || 0,
    chunkFallbacks: diagnostics?.totalChunkFallbacks || 0,
  };
}

function diagnosticsDelta(
  diagnostics: LookupDiagnostics | undefined,
  baseline: LookupStageCounterSnapshot
): LookupStageCounterSnapshot {
  const current = diagnosticsSnapshot(diagnostics);
  return {
    attempts: current.attempts - baseline.attempts,
    retries: current.retries - baseline.retries,
    timeouts: current.timeouts - baseline.timeouts,
    failures: current.failures - baseline.failures,
    chunkFallbacks: current.chunkFallbacks - baseline.chunkFallbacks,
  };
}

function dedupeResultsById(results: ChargeResult[]): ChargeResult[] {
  const byId = new Map<string, ChargeResult>();
  for (const result of results) {
    if (!byId.has(result.id)) {
      byId.set(result.id, result);
    }
  }
  return Array.from(byId.values());
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function buildPriceSummary(values: number[]): PriceSummary | undefined {
  if (values.length === 0) return undefined;
  return {
    estimatePrice: median(values),
    minPrice: Math.min(...values),
    maxPrice: Math.max(...values),
  };
}

function extractReferencePrice(row: ChargeResult): number | undefined {
  const value =
    row.cashPrice ?? row.minPrice ?? row.avgNegotiatedRate ?? row.maxPrice;

  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

function summarizeRows(rows: ChargeResult[]): PriceSummary | undefined {
  const values: number[] = [];
  for (const row of rows) {
    const reference = extractReferencePrice(row);
    if (reference != null) {
      values.push(reference);
    }
  }
  return buildPriceSummary(values);
}

function summarizeRowsByProvider(
  rows: ChargeResult[]
): Map<string, PriceSummary> {
  const valuesByProvider = new Map<string, number[]>();

  for (const row of rows) {
    const reference = extractReferencePrice(row);
    if (reference == null) continue;

    const existing = valuesByProvider.get(row.provider.id) || [];
    existing.push(reference);
    valuesByProvider.set(row.provider.id, existing);
  }

  const summaries = new Map<string, PriceSummary>();
  for (const [providerId, values] of valuesByProvider.entries()) {
    const summary = buildPriceSummary(values);
    if (summary) {
      summaries.set(providerId, summary);
    }
  }

  return summaries;
}

function inferAdderType(adder: PlannedAdder): OptionalAdderType {
  const id = adder.id.toLowerCase();
  const label = adder.label.toLowerCase();
  const text = `${id} ${label}`;

  if (text.includes("xray") || text.includes("x-ray")) return "xray";
  if (text.includes("mri")) return "mri";
  if (text.includes("ct")) return "ct";
  if (text.includes("ultrasound")) return "ultrasound";
  if (text.includes("lab")) return "lab";
  return "other";
}

async function queryCodeGroupsAtRadius({
  codeGroups,
  lat,
  lng,
  radiusMiles,
  filters,
  diagnostics,
  stage,
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles: number;
  filters?: LookupFilters;
  diagnostics?: LookupDiagnostics;
  stage: string;
}): Promise<ChargeResult[]> {
  if (codeGroups.length === 0) return [];

  const responses = await Promise.all(
    codeGroups.map(({ codeType, codes }) =>
      lookupCharges(
        { codes, codeType, lat, lng, radiusMiles, ...filters },
        { diagnostics, stage }
      )
    )
  );

  return dedupeResultsById(responses.flat());
}

async function queryCodeGroupsWithFallback({
  codeGroups,
  lat,
  lng,
  radiusMiles = 25,
  filters,
  descriptionFallback,
  diagnostics,
  stage,
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles?: number;
  filters?: LookupFilters;
  descriptionFallback?: string;
  diagnostics?: LookupDiagnostics;
  stage: string;
}): Promise<ChargeResult[]> {
  const baseline = diagnosticsSnapshot(diagnostics);
  const summary: LookupStageSummary = {
    stage,
    initialResults: 0,
    expandedResults: 0,
    descriptionResults: 0,
    usedExpandedRadius: false,
    usedDescriptionFallback: false,
    exhausted: false,
    attempts: 0,
    retries: 0,
    timeouts: 0,
    failures: 0,
    chunkFallbacks: 0,
  };

  const finalizeSummary = () => {
    if (!diagnostics) return;
    const delta = diagnosticsDelta(diagnostics, baseline);
    summary.attempts = delta.attempts;
    summary.retries = delta.retries;
    summary.timeouts = delta.timeouts;
    summary.failures = delta.failures;
    summary.chunkFallbacks = delta.chunkFallbacks;
    diagnostics.stageSummaries.push(summary);
  };

  const initial = await queryCodeGroupsAtRadius({
    codeGroups,
    lat,
    lng,
    radiusMiles,
    filters,
    diagnostics,
    stage: `${stage}:initial`,
  });
  summary.initialResults = initial.length;
  if (initial.length > 0) {
    finalizeSummary();
    return initial;
  }

  const expandedRadius = radiusMiles * 3;
  summary.usedExpandedRadius = true;
  const expanded = await queryCodeGroupsAtRadius({
    codeGroups,
    lat,
    lng,
    radiusMiles: expandedRadius,
    filters,
    diagnostics,
    stage: `${stage}:expanded`,
  });
  summary.expandedResults = expanded.length;
  if (expanded.length > 0) {
    finalizeSummary();
    return expanded;
  }

  if (descriptionFallback && descriptionFallback.trim().length > 0) {
    summary.usedDescriptionFallback = true;
    const fallbackRows = await lookupChargesByDescription(
      {
        searchTerms: descriptionFallback,
        lat,
        lng,
        radiusMiles: expandedRadius,
      },
      { diagnostics, stage: `${stage}:description` }
    );
    summary.descriptionResults = fallbackRows.length;
    if (fallbackRows.length > 0) {
      finalizeSummary();
      return fallbackRows;
    }
  }

  summary.exhausted = true;
  if (diagnostics && stage === "base") {
    diagnostics.fallbackExhausted = true;
  }
  finalizeSummary();
  return [];
}

function buildProviderCatalog(
  groups: ChargeResult[][]
): Map<string, ChargeResult> {
  const byProvider = new Map<string, ChargeResult>();
  for (const results of groups) {
    for (const result of results) {
      if (!byProvider.has(result.provider.id)) {
        byProvider.set(result.provider.id, result);
      }
    }
  }
  return byProvider;
}

function buildAdderSummaries(
  adderResults: Array<{ adder: PlannedAdder; rows: ChargeResult[] }>
): Map<string, ProviderAdderSummary> {
  const summaries = new Map<string, ProviderAdderSummary>();
  for (const entry of adderResults) {
    summaries.set(entry.adder.id, {
      providerSummaries: summarizeRowsByProvider(entry.rows),
      localSummary: summarizeRows(entry.rows),
    });
  }
  return summaries;
}

function buildOptionalAddersForProvider({
  providerId,
  adders,
  adderSummaries,
}: {
  providerId: string;
  adders: PlannedAdder[];
  adderSummaries: Map<string, ProviderAdderSummary>;
}): OptionalAdderEstimate[] {
  const estimates: OptionalAdderEstimate[] = [];

  for (const adder of adders) {
    const summary = adderSummaries.get(adder.id);
    if (!summary) continue;

    const providerSummary = summary.providerSummaries.get(providerId);
    const fallbackSummary = summary.localSummary;
    const selectedSummary = providerSummary || fallbackSummary;

    if (!selectedSummary) continue;

    estimates.push({
      id: adder.id,
      type: inferAdderType(adder),
      label: adder.label,
      estimatePrice: selectedSummary.estimatePrice,
      minPrice: selectedSummary.minPrice,
      maxPrice: selectedSummary.maxPrice,
      source: providerSummary ? "facility" : "local_fallback",
      confidence: providerSummary ? "high" : "low",
    });
  }

  return estimates;
}

function withEstimatedTotals(
  result: ChargeResult,
  base: PriceSummary | undefined,
  adders: OptionalAdderEstimate[]
): ChargeResult {
  if (!base || adders.length === 0) return result;

  const estimatedTotalMedian =
    base.estimatePrice +
    adders.reduce((sum, adder) => sum + (adder.estimatePrice || 0), 0);
  const estimatedTotalMin =
    base.minPrice +
    adders.reduce(
      (sum, adder) => sum + (adder.minPrice || adder.estimatePrice || 0),
      0
    );
  const estimatedTotalMax =
    base.maxPrice +
    adders.reduce(
      (sum, adder) => sum + (adder.maxPrice || adder.estimatePrice || 0),
      0
    );

  return {
    ...result,
    estimatedTotalMedian,
    estimatedTotalMin,
    estimatedTotalMax,
  };
}

function buildEncounterFirstResults({
  pricingPlan,
  baseResults,
  adderResults,
}: {
  pricingPlan: PricingPlan;
  baseResults: ChargeResult[];
  adderResults: Array<{ adder: PlannedAdder; rows: ChargeResult[] }>;
}): ChargeResult[] {
  const providerCatalog = buildProviderCatalog([
    baseResults,
    ...adderResults.map((entry) => entry.rows),
  ]);
  const baseByProvider = summarizeRowsByProvider(baseResults);
  const localBase = summarizeRows(baseResults);
  const adderSummaries = buildAdderSummaries(adderResults);

  const providerIds = new Set<string>([
    ...Array.from(baseByProvider.keys()),
    ...Array.from(providerCatalog.keys()),
  ]);

  const baseLabel = pricingPlan.encounterType
    ? ENCOUNTER_LABELS[pricingPlan.encounterType]
    : "Visit estimate";

  const cards: ChargeResult[] = [];

  for (const providerId of providerIds) {
    const template = providerCatalog.get(providerId);
    if (!template) continue;

    const facilityBase = baseByProvider.get(providerId);
    const baseSummary = facilityBase || localBase;
    if (!baseSummary) continue;

    const optionalAdders = buildOptionalAddersForProvider({
      providerId,
      adders: pricingPlan.adders,
      adderSummaries,
    });

    const baseCard: ChargeResult = {
      ...template,
      id: `${providerId}::encounter`,
      description: baseLabel,
      cpt: undefined,
      hcpcs: undefined,
      msDrg: undefined,
      pricingMode: "encounter_first",
      baseLabel,
      baseSource: facilityBase ? "facility" : "local_fallback",
      proxyLabel: pricingPlan.proxyLabel,
      cashPrice: baseSummary.estimatePrice,
      minPrice: baseSummary.minPrice,
      maxPrice: baseSummary.maxPrice,
      optionalAdders,
    };

    cards.push(withEstimatedTotals(baseCard, baseSummary, optionalAdders));
  }

  return cards;
}

function buildProcedureFirstResults({
  pricingPlan,
  baseResults,
  adderResults,
}: {
  pricingPlan: PricingPlan;
  baseResults: ChargeResult[];
  adderResults: Array<{ adder: PlannedAdder; rows: ChargeResult[] }>;
}): ChargeResult[] {
  const adderSummaries = buildAdderSummaries(adderResults);
  const baseLabel =
    pricingPlan.baseCodeGroups[0]?.label || "Primary procedure estimate";

  return baseResults.map((row) => {
    const baseEstimate = extractReferencePrice(row);
    const baseSummary = baseEstimate
      ? {
          estimatePrice: baseEstimate,
          minPrice: row.minPrice ?? baseEstimate,
          maxPrice: row.maxPrice ?? baseEstimate,
        }
      : undefined;

    const optionalAdders = buildOptionalAddersForProvider({
      providerId: row.provider.id,
      adders: pricingPlan.adders,
      adderSummaries,
    });

    const next: ChargeResult = {
      ...row,
      pricingMode: "procedure_first",
      baseLabel,
      baseSource: "facility",
      proxyLabel: pricingPlan.proxyLabel,
      optionalAdders,
    };

    return withEstimatedTotals(next, baseSummary, optionalAdders);
  });
}

export async function lookupWithPricingPlan({
  pricingPlan,
  lat,
  lng,
  radiusMiles = 25,
  descriptionFallback,
  diagnostics,
}: LookupWithPlanParams): Promise<ChargeResult[]> {
  // Thread laterality/bodySite to base results only — adders are separate procedures
  const baseFilters: LookupFilters = {
    laterality: pricingPlan.laterality,
    bodySite: pricingPlan.bodySite,
  };
  const baseResults = await queryCodeGroupsWithFallback({
    codeGroups: pricingPlan.baseCodeGroups,
    lat,
    lng,
    radiusMiles,
    filters: baseFilters,
    descriptionFallback,
    diagnostics,
    stage: "base",
  });

  const adderResults = await Promise.all(
    pricingPlan.adders.map(async (adder) => ({
      adder,
      rows: await queryCodeGroupsWithFallback({
        codeGroups: adder.codeGroups,
        lat,
        lng,
        radiusMiles,
        diagnostics,
        stage: `adder:${adder.id}`,
      }),
    }))
  );

  const rawResults =
    pricingPlan.mode === "encounter_first"
      ? buildEncounterFirstResults({
          pricingPlan,
          baseResults,
          adderResults,
        })
      : buildProcedureFirstResults({
          pricingPlan,
          baseResults,
          adderResults,
        });

  return normalizeAndRankResults({
    results: rawResults,
    userLat: lat,
    userLng: lng,
    maxRadiusMiles: radiusMiles * 3,
  });
}

/**
 * Primary search: Look up charges by billing code + geographic radius.
 * Calls the search_charges_nearby() RPC.
 *
 * The RPC handles cross-column search: when codeType is 'cpt', Postgres
 * checks both the cpt AND hcpcs columns (hospitals store CPT codes in either).
 */
function splitIntoCodeChunks(codes: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += chunkSize) {
    chunks.push(codes.slice(i, i + chunkSize));
  }
  return chunks;
}

async function executeRpcWithRetry<RowType>({
  supabase,
  rpcName,
  rpcParams,
  diagnostics,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  rpcName: "search_charges_nearby" | "search_charges_by_description";
  rpcParams: Record<string, unknown>;
  diagnostics?: LookupDiagnostics;
}): Promise<RpcExecutionResult<RowType>> {
  const result: RpcExecutionResult<RowType> = {
    rows: [],
    attempts: 0,
    retries: 0,
    timeouts: 0,
    failures: 0,
    timedOut: false,
  };

  for (let attempt = 1; attempt <= RPC_MAX_RETRIES + 1; attempt += 1) {
    result.attempts += 1;
    if (diagnostics) {
      diagnostics.totalRpcAttempts += 1;
    }

    try {
      const { data, error } = await supabase.rpc(rpcName, rpcParams);
      if (!error) {
        result.rows = (data as RowType[]) || [];
        return result;
      }

      result.failures += 1;
      result.errorCode =
        typeof error.code === "string" ? error.code : undefined;
      result.errorMessage = error.message;
      if (diagnostics) {
        diagnostics.totalFailures += 1;
      }
    } catch (error) {
      result.failures += 1;
      result.errorCode = "rpc_exception";
      result.errorMessage =
        error instanceof Error ? error.message : String(error);
      if (diagnostics) {
        diagnostics.totalFailures += 1;
      }
    }

    const timedOut = isTimeoutCode(result.errorCode);
    result.timedOut = timedOut;
    if (timedOut) {
      result.timeouts += 1;
      if (diagnostics) {
        diagnostics.totalTimeouts += 1;
      }
    }

    const shouldRetry = timedOut && attempt <= RPC_MAX_RETRIES;
    if (!shouldRetry) {
      return result;
    }

    result.retries += 1;
    if (diagnostics) {
      diagnostics.totalRetries += 1;
    }
    const retryDelay =
      RPC_RETRY_DELAYS_MS[
        Math.min(attempt - 1, RPC_RETRY_DELAYS_MS.length - 1)
      ];
    await delay(retryDelay);
  }

  return result;
}

export async function lookupCharges(
  {
    codes,
    codeType = "cpt",
    lat,
    lng,
    radiusMiles = 25,
    limit = CODE_LOOKUP_LIMIT,
    providerLimit = PROVIDER_LIMIT,
    laterality,
    bodySite,
  }: LookupParams,
  context: RpcExecutionContext = {}
): Promise<ChargeResult[]> {
  if (codes.length === 0) return [];
  const supabase = await createClient();
  const normalizedCodes = Array.from(
    new Set(
      codes
        .map((code) => code.trim().toUpperCase())
        .filter((code) => code.length > 0)
    )
  );

  const rpcParams: Record<string, unknown> = {
    p_code_type: codeType,
    p_codes: normalizedCodes,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: milesToKm(radiusMiles),
    p_limit: limit,
    p_provider_limit: providerLimit,
    ...(laterality ? { p_laterality: laterality } : {}),
    ...(bodySite ? { p_body_site: bodySite } : {}),
  };

  const initial = await executeRpcWithRetry<RpcRow>({
    supabase,
    rpcName: "search_charges_nearby",
    rpcParams,
    diagnostics: context.diagnostics,
  });

  if (!initial.errorCode) {
    return mapRows(initial.rows);
  }

  const canChunkFallback =
    initial.timedOut && normalizedCodes.length > CODE_CHUNK_FALLBACK_SIZE;
  if (!canChunkFallback) {
    console.error("Charge lookup error:", {
      stage: context.stage,
      codeType,
      codeCount: normalizedCodes.length,
      errorCode: initial.errorCode,
      errorMessage: initial.errorMessage,
    });
    return [];
  }

  if (context.diagnostics) {
    context.diagnostics.totalChunkFallbacks += 1;
  }

  const allChunkRows: RpcRow[] = [];
  const codeChunks = splitIntoCodeChunks(
    normalizedCodes,
    CODE_CHUNK_FALLBACK_SIZE
  );
  for (const [chunkIndex, chunk] of codeChunks.entries()) {
    const chunkResult = await executeRpcWithRetry<RpcRow>({
      supabase,
      rpcName: "search_charges_nearby",
      rpcParams: {
        ...rpcParams,
        p_codes: chunk,
      },
      diagnostics: context.diagnostics,
    });

    if (chunkResult.errorCode) {
      console.error("Charge lookup chunk error:", {
        stage: context.stage,
        chunkIndex: chunkIndex + 1,
        chunkTotal: codeChunks.length,
        codeType,
        codeCount: chunk.length,
        errorCode: chunkResult.errorCode,
        errorMessage: chunkResult.errorMessage,
      });
      continue;
    }

    allChunkRows.push(...chunkResult.rows);
  }

  const chunkedResults = dedupeResultsById(mapRows(allChunkRows));
  return chunkedResults;
}

/**
 * Fallback search: Look up charges by description text + geographic radius.
 * Used when code-based search returns zero results.
 * Calls the search_charges_by_description() RPC.
 */
export async function lookupChargesByDescription(
  {
    searchTerms,
    lat,
    lng,
    radiusMiles = 25,
    limit = DESCRIPTION_LOOKUP_LIMIT,
    providerLimit = PROVIDER_LIMIT,
  }: FallbackLookupParams,
  context: RpcExecutionContext = {}
): Promise<ChargeResult[]> {
  if (!searchTerms.trim()) return [];
  const supabase = await createClient();
  const radiusKm = milesToKm(radiusMiles);

  const result = await executeRpcWithRetry<RpcRow>({
    supabase,
    rpcName: "search_charges_by_description",
    rpcParams: {
      p_search_terms: searchTerms,
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radiusKm,
      p_limit: limit,
      p_provider_limit: providerLimit,
    },
    diagnostics: context.diagnostics,
  });

  if (result.errorCode) {
    console.error("Description lookup error:", {
      stage: context.stage,
      searchTerms,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });
    return [];
  }

  return mapRows(result.rows);
}

/**
 * Legacy lookup helper for call sites that still pass raw code groups.
 */
export async function lookupChargesWithFallback({
  codeGroups,
  lat,
  lng,
  radiusMiles = 25,
  descriptionFallback,
  diagnostics,
  stage = "legacy",
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles?: number;
  descriptionFallback?: string;
  diagnostics?: LookupDiagnostics;
  stage?: string;
}): Promise<ChargeResult[]> {
  return queryCodeGroupsWithFallback({
    codeGroups,
    lat,
    lng,
    radiusMiles,
    descriptionFallback,
    diagnostics,
    stage,
  });
}

// ---------------------------------------------------------------------------
// Row mapper: Supabase RPC result → ChargeResult
// ---------------------------------------------------------------------------

interface RpcRow {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_address: string | null;
  provider_city: string | null;
  provider_state: string | null;
  provider_zip: string | null;
  provider_lat: number | null;
  provider_lng: number | null;
  provider_phone: string | null;
  provider_website: string | null;
  provider_type: string | null;
  description: string | null;
  setting: string | null;
  billing_class: string | null;
  laterality: string | null;
  body_site: string | null;
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  gross_charge: number | null;
  cash_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
  max_negotiated_rate: number | null;
  payer_count: number | null;
  source: string | null;
  last_updated: string | null;
  distance_km: number | null;
}

function mapRows(rows: RpcRow[]): ChargeResult[] {
  return rows.map((row) => {
    const distanceKm = row.distance_km ?? undefined;
    const distanceMiles =
      distanceKm !== undefined ? kmToMiles(distanceKm) : undefined;

    return {
      id: row.id,
      provider: {
        id: row.provider_id,
        name: row.provider_name,
        address: row.provider_address ?? undefined,
        city: row.provider_city ?? undefined,
        state: row.provider_state ?? undefined,
        zip: row.provider_zip ?? undefined,
        lat: row.provider_lat ?? undefined,
        lng: row.provider_lng ?? undefined,
        phone: row.provider_phone ?? undefined,
        website: row.provider_website ?? undefined,
        providerType: row.provider_type ?? undefined,
      },
      description: row.description ?? undefined,
      setting: row.setting as ChargeResult["setting"],
      billingClass: row.billing_class ?? undefined,
      laterality: (row.laterality as ChargeResult["laterality"]) ?? undefined,
      bodySite: (row.body_site as ChargeResult["bodySite"]) ?? undefined,
      cpt: row.cpt ?? undefined,
      hcpcs: row.hcpcs ?? undefined,
      msDrg: row.ms_drg ?? undefined,
      grossCharge: row.gross_charge ?? undefined,
      cashPrice: row.cash_price ?? undefined,
      minPrice: row.min_price ?? undefined,
      maxPrice: row.max_price ?? undefined,
      avgNegotiatedRate: row.avg_negotiated_rate ?? undefined,
      minNegotiatedRate: row.min_negotiated_rate ?? undefined,
      maxNegotiatedRate: row.max_negotiated_rate ?? undefined,
      payerCount: row.payer_count ?? undefined,
      source: row.source ?? undefined,
      lastUpdated: row.last_updated ?? undefined,
      distanceKm,
      distanceMiles,
    };
  });
}
