import { createClient } from "@/lib/supabase/server";
import { milesToKm, kmToMiles } from "@/lib/units";
// @ts-expect-error zipcodes has no bundled TypeScript declarations.
import zipcodes from "zipcodes";
import type {
  ChargeResult,
  BillingCodeType,
  OptionalAdderEstimate,
  OptionalAdderType,
  PlannedAdder,
  PricingPlan,
} from "@/types";

interface LookupParams {
  codes: string[];
  codeType?: BillingCodeType;
  lat: number;
  lng: number;
  radiusMiles?: number;
}

interface FallbackLookupParams {
  searchTerms: string;
  lat: number;
  lng: number;
  radiusMiles?: number;
  limit?: number;
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

function extractStateAwareZip(address: string | undefined, state: string | undefined): string | undefined {
  if (!address) return undefined;

  const normalizedState = state?.trim().toUpperCase();
  if (normalizedState && normalizedState.length === 2) {
    const scopedMatch = address
      .toUpperCase()
      .match(new RegExp(`\\b${escapeRegex(normalizedState)}\\s+(\\d{5})(?:-\\d{4})?\\b`));
    if (scopedMatch?.[1]) return scopedMatch[1];
  }

  const trailingMatch = address.match(/(\d{5})(?:-\d{4})?\s*$/);
  return trailingMatch?.[1];
}

function lookupZipCoordinates(zip: string | undefined): { lat: number; lng: number } | undefined {
  if (!zip) return undefined;

  const match = zipcodes.lookup(zip) as
    | { latitude?: number; longitude?: number }
    | null;

  if (match?.latitude == null || match?.longitude == null) return undefined;
  return { lat: match.latitude, lng: match.longitude };
}

function resolveProviderCoordinates(result: ChargeResult): { lat: number | undefined; lng: number | undefined } {
  const providerLat = result.provider.lat;
  const providerLng = result.provider.lng;
  const zipFromAddress = extractStateAwareZip(result.provider.address, result.provider.state);
  const zipFromProvider = normalizeZip(result.provider.zip);
  const zipCoordinates = lookupZipCoordinates(zipFromAddress || zipFromProvider);

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
      recomputedDistanceMiles = haversineMiles(userLat, userLng, latValue, lngValue);
    }

    if (
      recomputedDistanceMiles != null &&
      Number.isFinite(recomputedDistanceMiles) &&
      recomputedDistanceMiles > maxRadiusMiles + DISTANCE_FILTER_TOLERANCE_MILES
    ) {
      continue;
    }

    const nextDistanceMiles =
      recomputedDistanceMiles != null && Number.isFinite(recomputedDistanceMiles)
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
    row.cashPrice ??
    row.minPrice ??
    row.avgNegotiatedRate ??
    row.maxPrice;

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

function summarizeRowsByProvider(rows: ChargeResult[]): Map<string, PriceSummary> {
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
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles: number;
}): Promise<ChargeResult[]> {
  if (codeGroups.length === 0) return [];

  const responses = await Promise.all(
    codeGroups.map(({ codeType, codes }) =>
      lookupCharges({ codes, codeType, lat, lng, radiusMiles })
    )
  );

  return dedupeResultsById(responses.flat());
}

async function queryCodeGroupsWithFallback({
  codeGroups,
  lat,
  lng,
  radiusMiles = 25,
  descriptionFallback,
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles?: number;
  descriptionFallback?: string;
}): Promise<ChargeResult[]> {
  const initial = await queryCodeGroupsAtRadius({
    codeGroups,
    lat,
    lng,
    radiusMiles,
  });
  if (initial.length > 0) return initial;

  const expandedRadius = radiusMiles * 3;
  const expanded = await queryCodeGroupsAtRadius({
    codeGroups,
    lat,
    lng,
    radiusMiles: expandedRadius,
  });
  if (expanded.length > 0) return expanded;

  if (descriptionFallback) {
    return lookupChargesByDescription({
      searchTerms: descriptionFallback,
      lat,
      lng,
      radiusMiles: expandedRadius,
    });
  }

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
    adders.reduce((sum, adder) => sum + (adder.minPrice || adder.estimatePrice || 0), 0);
  const estimatedTotalMax =
    base.maxPrice +
    adders.reduce((sum, adder) => sum + (adder.maxPrice || adder.estimatePrice || 0), 0);

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
}: LookupWithPlanParams): Promise<ChargeResult[]> {
  const baseResults = await queryCodeGroupsWithFallback({
    codeGroups: pricingPlan.baseCodeGroups,
    lat,
    lng,
    radiusMiles,
    descriptionFallback,
  });

  const adderResults = await Promise.all(
    pricingPlan.adders.map(async (adder) => ({
      adder,
      rows: await queryCodeGroupsWithFallback({
        codeGroups: adder.codeGroups,
        lat,
        lng,
        radiusMiles,
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
export async function lookupCharges({
  codes,
  codeType = "cpt",
  lat,
  lng,
  radiusMiles = 25,
}: LookupParams): Promise<ChargeResult[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_charges_nearby", {
    p_code_type: codeType,
    p_codes: codes,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: milesToKm(radiusMiles),
  });

  if (error) {
    console.error("Charge lookup error:", error);
    return [];
  }

  return mapRows(data || []);
}

/**
 * Fallback search: Look up charges by description text + geographic radius.
 * Used when code-based search returns zero results.
 * Calls the search_charges_by_description() RPC.
 */
export async function lookupChargesByDescription({
  searchTerms,
  lat,
  lng,
  radiusMiles = 25,
  limit = 50,
}: FallbackLookupParams): Promise<ChargeResult[]> {
  const supabase = await createClient();
  const radiusKm = milesToKm(radiusMiles);

  const { data, error } = await supabase.rpc("search_charges_by_description", {
    p_search_terms: searchTerms,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_limit: limit,
  });

  if (error) {
    console.error("Description lookup error:", error);
    return [];
  }

  return mapRows(data || []);
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
}: {
  codeGroups: { codeType: BillingCodeType; codes: string[] }[];
  lat: number;
  lng: number;
  radiusMiles?: number;
  descriptionFallback?: string;
  adderContext?: string;
}): Promise<ChargeResult[]> {
  return queryCodeGroupsWithFallback({
    codeGroups,
    lat,
    lng,
    radiusMiles,
    descriptionFallback,
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
    const distanceMiles = distanceKm !== undefined ? kmToMiles(distanceKm) : undefined;

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
