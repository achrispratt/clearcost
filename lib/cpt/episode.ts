import { createClient } from "@/lib/supabase/server";
import { median } from "@/lib/cpt/lookup";
import type { ChargeResult, EpisodeEstimate } from "@/types";

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------

interface EpisodeDefinitionRow {
  id: string;
  principal_code: string;
  label: string;
  category: string | null;
}

interface ComponentChargeRow {
  provider_id: string;
  component_code: string;
  component_code_type: string;
  component_tier: string;
  component_association: number;
  cash_price: number | null;
  gross_charge: number | null;
  avg_negotiated_rate: number | null;
  min_price: number | null;
  max_price: number | null;
}

// ---------------------------------------------------------------------------
// Price extraction (matches extractReferencePrice priority in lookup.ts)
// ---------------------------------------------------------------------------

function extractComponentPrice(row: ComponentChargeRow): number | undefined {
  const value =
    row.cash_price ?? row.min_price ?? row.avg_negotiated_rate ?? row.max_price;
  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

const MIN_COVERAGE_RATIO = 0.5;

// ---------------------------------------------------------------------------
// Per-provider episode cost aggregation
// ---------------------------------------------------------------------------

interface ComponentSummary {
  estimatePrice?: number;
  minPrice?: number;
  maxPrice?: number;
}

function summarizeComponentsForProvider(
  providerRows: ComponentChargeRow[]
): Map<string, ComponentSummary> {
  const byCode = new Map<string, ComponentChargeRow[]>();
  for (const row of providerRows) {
    const existing = byCode.get(row.component_code) || [];
    existing.push(row);
    byCode.set(row.component_code, existing);
  }

  const summaries = new Map<string, ComponentSummary>();
  for (const [code, rows] of byCode) {
    let bestPrice: number | undefined;
    let bestMin: number | undefined;
    let bestMax: number | undefined;

    for (const row of rows) {
      const price = extractComponentPrice(row);
      if (price != null && (bestPrice == null || price < bestPrice)) {
        bestPrice = price;
        const minVal =
          row.min_price ?? row.cash_price ?? row.avg_negotiated_rate;
        bestMin = minVal != null && minVal > 0 ? minVal : undefined;
        const maxVal = row.max_price ?? row.cash_price ?? row.gross_charge;
        bestMax = maxVal != null && maxVal > 0 ? maxVal : undefined;
      }
    }

    summaries.set(code, {
      estimatePrice: bestPrice,
      minPrice: bestMin,
      maxPrice: bestMax,
    });
  }

  return summaries;
}

function computeLocalFallbacks(
  allRows: ComponentChargeRow[]
): Map<string, { median: number; min: number; max: number }> {
  const byCode = new Map<string, number[]>();
  for (const row of allRows) {
    const price = extractComponentPrice(row);
    if (price == null) continue;
    const existing = byCode.get(row.component_code) || [];
    existing.push(price);
    byCode.set(row.component_code, existing);
  }

  const fallbacks = new Map<
    string,
    { median: number; min: number; max: number }
  >();
  for (const [code, prices] of byCode) {
    if (prices.length === 0) continue;
    fallbacks.set(code, {
      median: median(prices),
      min: Math.min(...prices),
      max: Math.max(...prices),
    });
  }

  return fallbacks;
}

// ---------------------------------------------------------------------------
// Build EpisodeEstimate for a single provider
// ---------------------------------------------------------------------------

function buildEpisodeEstimate({
  episodeDef,
  providerComponents,
  localFallbacks,
  totalBillableComponents,
  basePriceEstimate,
}: {
  episodeDef: EpisodeDefinitionRow;
  providerComponents: Map<string, ComponentSummary>;
  localFallbacks: Map<string, { median: number; min: number; max: number }>;
  totalBillableComponents: number;
  basePriceEstimate?: number;
}): EpisodeEstimate {
  let totalMedian = basePriceEstimate ?? 0;
  let totalMin = basePriceEstimate ?? 0;
  let totalMax = basePriceEstimate ?? 0;
  let priceableCount = basePriceEstimate != null ? 1 : 0;

  const allCodes = new Set([
    ...providerComponents.keys(),
    ...localFallbacks.keys(),
  ]);

  for (const code of allCodes) {
    const providerSummary = providerComponents.get(code);
    const fallback = localFallbacks.get(code);

    const estimate = providerSummary?.estimatePrice ?? fallback?.median;
    const min =
      providerSummary?.minPrice ??
      providerSummary?.estimatePrice ??
      fallback?.min;
    const max =
      providerSummary?.maxPrice ??
      providerSummary?.estimatePrice ??
      fallback?.max;

    if (estimate != null) {
      totalMedian += estimate;
      totalMin += min ?? estimate;
      totalMax += max ?? estimate;
      priceableCount++;
    }
  }

  const componentCount = totalBillableComponents + 1;

  return {
    episodeId: episodeDef.id,
    principalCode: episodeDef.principal_code,
    label: episodeDef.label,
    category: episodeDef.category ?? undefined,
    estimatedAllInMedian: priceableCount > 0 ? totalMedian : undefined,
    estimatedAllInMin: priceableCount > 0 ? totalMin : undefined,
    estimatedAllInMax: priceableCount > 0 ? totalMax : undefined,
    componentCount,
    priceableCount,
    coverageRatio: componentCount > 0 ? priceableCount / componentCount : 0,
    source: "turquoise_ssp",
  };
}

// ---------------------------------------------------------------------------
// Process a single episode: collect matching results, query component charges,
// and attach estimates to the results array.
// ---------------------------------------------------------------------------

async function processEpisode({
  principalCode,
  episodeDef,
  results,
  enrichedResults,
  supabase,
}: {
  principalCode: string;
  episodeDef: EpisodeDefinitionRow;
  results: ChargeResult[];
  enrichedResults: ChargeResult[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}): Promise<void> {
  const matchingIndices: number[] = [];
  const providerIds = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const resultCode = (r.cpt || r.hcpcs || "").trim().toUpperCase();
    if (resultCode === principalCode) {
      matchingIndices.push(i);
      providerIds.add(r.provider.id);
    }
  }

  if (providerIds.size === 0) return;

  const { data: componentRows } = await supabase.rpc(
    "lookup_episode_component_charges",
    {
      p_principal_code: principalCode,
      p_provider_ids: Array.from(providerIds),
      p_min_association: 0.4,
    }
  );

  if (!componentRows || componentRows.length === 0) return;

  const typedRows = componentRows as ComponentChargeRow[];
  const billableCodes = new Set(typedRows.map((r) => r.component_code));
  const totalBillableComponents = billableCodes.size;
  const localFallbacks = computeLocalFallbacks(typedRows);

  const rowsByProvider = new Map<string, ComponentChargeRow[]>();
  for (const row of typedRows) {
    const existing = rowsByProvider.get(row.provider_id) || [];
    existing.push(row);
    rowsByProvider.set(row.provider_id, existing);
  }

  for (const idx of matchingIndices) {
    const result = enrichedResults[idx];
    const providerRows = rowsByProvider.get(result.provider.id) || [];
    const providerComponents = summarizeComponentsForProvider(providerRows);

    const basePriceEstimate =
      result.cashPrice ?? result.avgNegotiatedRate ?? result.grossCharge;

    const estimate = buildEpisodeEstimate({
      episodeDef,
      providerComponents,
      localFallbacks,
      totalBillableComponents,
      basePriceEstimate:
        basePriceEstimate != null && basePriceEstimate > 0
          ? basePriceEstimate
          : undefined,
    });

    if (
      estimate.estimatedAllInMedian != null &&
      estimate.priceableCount > 1 &&
      estimate.coverageRatio >= MIN_COVERAGE_RATIO
    ) {
      enrichedResults[idx] = {
        ...result,
        episodeEstimate: estimate,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Main enrichment function
// ---------------------------------------------------------------------------

export async function enrichWithEpisodeEstimates(
  results: ChargeResult[]
): Promise<ChargeResult[]> {
  if (results.length === 0) return results;

  try {
    const supabase = await createClient();

    const principalCodes = new Set<string>();
    for (const result of results) {
      if (result.cpt) principalCodes.add(result.cpt.trim().toUpperCase());
      if (result.hcpcs) principalCodes.add(result.hcpcs.trim().toUpperCase());
    }

    if (principalCodes.size === 0) return results;

    const { data: episodeDefs } = await supabase
      .from("episode_definitions")
      .select("id, principal_code, label, category")
      .in("principal_code", Array.from(principalCodes));

    if (!episodeDefs || episodeDefs.length === 0) return results;

    const episodeByCode = new Map<string, EpisodeDefinitionRow>();
    for (const def of episodeDefs) {
      episodeByCode.set(def.principal_code, def);
    }

    const enrichedResults = [...results];

    // Fire all episode RPC calls in parallel
    await Promise.all(
      Array.from(episodeByCode.entries()).map(([principalCode, episodeDef]) =>
        processEpisode({
          principalCode,
          episodeDef,
          results,
          enrichedResults,
          supabase,
        })
      )
    );

    return enrichedResults;
  } catch (error) {
    console.warn(
      "Episode enrichment failed (non-fatal):",
      error instanceof Error ? error.message : String(error)
    );
    return results;
  }
}
