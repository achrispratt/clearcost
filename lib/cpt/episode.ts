import { createClient } from "@/lib/supabase/server";
import { median } from "@/lib/cpt/lookup";
import type {
  ChargeResult,
  EpisodeBillingClass,
  EpisodeEstimate,
  EpisodePriceBasis,
} from "@/types";

// ---------------------------------------------------------------------------
// Types for Supabase query results
// ---------------------------------------------------------------------------

interface EpisodeDefinitionRow {
  id: string;
  principal_code: string;
  label: string;
  category: string | null;
}

export interface ComponentChargeRow {
  provider_id: string;
  component_code: string;
  component_code_type: string;
  component_tier: string;
  component_association: number;
  billing_class?: string | null;
  cash_price: number | null;
  gross_charge: number | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate?: number | null;
  max_negotiated_rate?: number | null;
  min_price: number | null;
  max_price: number | null;
}

/** The principal charge row an estimate is built around. */
export type PrincipalCharge = Pick<
  ChargeResult,
  | "billingClass"
  | "cashPrice"
  | "avgNegotiatedRate"
  | "minNegotiatedRate"
  | "maxNegotiatedRate"
>;

const MIN_ASSOCIATION = 0.4;
const MIN_COVERAGE_RATIO = 0.5;

// Tried in order; on equal coverage the earlier basis wins.
const PRICE_BASES: EpisodePriceBasis[] = ["cash", "negotiated"];

// ---------------------------------------------------------------------------
// Billing class normalization
// ---------------------------------------------------------------------------

type NormalizedBillingClass =
  | "facility"
  | "professional"
  | "both"
  | "unspecified"
  | "other";

/**
 * MRF billing_class values are inconsistent ("Facility", "FACILITY",
 * "faciltiy", "HOSPITAL", null). Collapse them into a small fixed set.
 */
export function normalizeBillingClass(
  raw: string | null | undefined
): NormalizedBillingClass {
  const value = raw?.trim().toLowerCase();
  if (!value) return "unspecified";
  if (["facility", "faciltiy", "hospital", "institutional"].includes(value)) {
    return "facility";
  }
  if (value === "professional") return "professional";
  if (value === "both") return "both";
  return "other";
}

/**
 * The billing class an estimate is built in. Unlabeled rows are treated as
 * facility charges (hospital MRFs are predominantly facility). "Both" rows
 * already bundle facility + professional, so they can't be combined with
 * either and get no estimate.
 */
export function episodeBillingClassFor(
  raw: string | null | undefined
): EpisodeBillingClass | undefined {
  const normalized = normalizeBillingClass(raw);
  if (normalized === "facility" || normalized === "unspecified") {
    return "facility";
  }
  if (normalized === "professional") return "professional";
  return undefined;
}

/**
 * Rows for one component code that may be added to an estimate of the given
 * class. Facility estimates prefer explicitly-labeled facility rows and fall
 * back to unlabeled rows only when a code has no facility row.
 */
function eligibleRowsForClass(
  rows: ComponentChargeRow[],
  billingClass: EpisodeBillingClass
): ComponentChargeRow[] {
  if (billingClass === "professional") {
    return rows.filter(
      (r) => normalizeBillingClass(r.billing_class) === "professional"
    );
  }
  const facility = rows.filter(
    (r) => normalizeBillingClass(r.billing_class) === "facility"
  );
  if (facility.length > 0) return facility;
  return rows.filter(
    (r) => normalizeBillingClass(r.billing_class) === "unspecified"
  );
}

// ---------------------------------------------------------------------------
// Price extraction — one basis at a time, never mixed, never gross
// ---------------------------------------------------------------------------

function positive(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

interface PricePoint {
  estimate: number;
  min: number;
  max: number;
}

/** Price of one charge row on a single basis, or undefined if it has none. */
export function extractComponentPrice(
  row: ComponentChargeRow,
  basis: EpisodePriceBasis
): PricePoint | undefined {
  if (basis === "cash") {
    const cash = positive(row.cash_price);
    return cash != null ? { estimate: cash, min: cash, max: cash } : undefined;
  }
  const avg = positive(row.avg_negotiated_rate);
  if (avg == null) return undefined;
  return {
    estimate: avg,
    min: positive(row.min_negotiated_rate) ?? avg,
    max: positive(row.max_negotiated_rate) ?? avg,
  };
}

function extractPrincipalPrice(
  principal: PrincipalCharge,
  basis: EpisodePriceBasis
): PricePoint | undefined {
  if (basis === "cash") {
    const cash = positive(principal.cashPrice);
    return cash != null ? { estimate: cash, min: cash, max: cash } : undefined;
  }
  const avg = positive(principal.avgNegotiatedRate);
  if (avg == null) return undefined;
  return {
    estimate: avg,
    min: positive(principal.minNegotiatedRate) ?? avg,
    max: positive(principal.maxNegotiatedRate) ?? avg,
  };
}

/**
 * Collapse a hospital's rows for one component code (it may publish several,
 * e.g. per setting or description) into one price on the given basis.
 */
function summarizeComponent(
  rows: ComponentChargeRow[],
  basis: EpisodePriceBasis
): PricePoint | undefined {
  const points = rows
    .map((r) => extractComponentPrice(r, basis))
    .filter((p): p is PricePoint => p != null);
  if (points.length === 0) return undefined;
  return {
    estimate: median(points.map((p) => p.estimate)),
    min: Math.min(...points.map((p) => p.min)),
    max: Math.max(...points.map((p) => p.max)),
  };
}

// ---------------------------------------------------------------------------
// Build EpisodeEstimate for a single provider
// ---------------------------------------------------------------------------

/**
 * Build one hospital's episode estimate from that hospital's own charges only.
 *
 * - Every line item uses the same price basis (cash, or average negotiated).
 *   Both are tried; the one that prices more of the episode wins, cash on a
 *   tie. Gross charges are never used.
 * - Every line item is in the principal charge's billing class.
 * - Coverage is measured against the episode's full component list, so the
 *   same hospital always gets the same estimate.
 *
 * Returns undefined when the principal charge has no usable class or price.
 */
export function buildEpisodeEstimate({
  episodeDef,
  componentCodes,
  providerRows,
  principal,
}: {
  episodeDef: EpisodeDefinitionRow;
  /** Episode component codes, excluding the principal code itself. */
  componentCodes: string[];
  /** This provider's component charge rows. */
  providerRows: ComponentChargeRow[];
  principal: PrincipalCharge;
}): EpisodeEstimate | undefined {
  const billingClass = episodeBillingClassFor(principal.billingClass);
  if (!billingClass) return undefined;

  const rowsByCode = new Map<string, ComponentChargeRow[]>();
  for (const row of providerRows) {
    const code = row.component_code.trim().toUpperCase();
    const existing = rowsByCode.get(code) || [];
    existing.push(row);
    rowsByCode.set(code, existing);
  }

  let best:
    | {
        basis: EpisodePriceBasis;
        total: PricePoint;
        priceableCount: number;
      }
    | undefined;

  for (const basis of PRICE_BASES) {
    const base = extractPrincipalPrice(principal, basis);
    if (!base) continue;

    const total = { ...base };
    let priceableCount = 1;

    for (const code of componentCodes) {
      const rows = eligibleRowsForClass(
        rowsByCode.get(code) || [],
        billingClass
      );
      const price = summarizeComponent(rows, basis);
      if (!price) continue;
      total.estimate += price.estimate;
      total.min += price.min;
      total.max += price.max;
      priceableCount++;
    }

    if (!best || priceableCount > best.priceableCount) {
      best = { basis, total, priceableCount };
    }
  }

  if (!best) return undefined;

  const componentCount = componentCodes.length + 1;

  return {
    episodeId: episodeDef.id,
    principalCode: episodeDef.principal_code,
    label: episodeDef.label,
    category: episodeDef.category ?? undefined,
    estimatedAllInMedian: best.total.estimate,
    estimatedAllInMin: best.total.min,
    estimatedAllInMax: best.total.max,
    componentCount,
    priceableCount: best.priceableCount,
    coverageRatio: best.priceableCount / componentCount,
    priceBasis: best.basis,
    billingClass,
    source: "turquoise_ssp",
  };
}

/** Whether an estimate prices enough of the episode to show. */
export function isEstimateDisplayable(estimate: EpisodeEstimate): boolean {
  return (
    estimate.priceableCount > 1 && estimate.coverageRatio >= MIN_COVERAGE_RATIO
  );
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

  const [{ data: componentDefs }, { data: componentRows }] = await Promise.all([
    supabase
      .from("episode_components")
      .select("code")
      .eq("episode_id", episodeDef.id)
      .gte("association", MIN_ASSOCIATION)
      .in("code_type", ["cpt", "hcpcs"]),
    supabase.rpc("lookup_episode_component_charges", {
      p_principal_code: principalCode,
      p_provider_ids: Array.from(providerIds),
      p_min_association: MIN_ASSOCIATION,
    }),
  ]);

  // SSPs list the principal code as one of their own components; it is
  // already priced from the result row, so it must not be counted twice.
  const componentCodes = Array.from(
    new Set(
      ((componentDefs as { code: string }[] | null) ?? [])
        .map((c) => c.code.trim().toUpperCase())
        .filter((code) => code !== principalCode)
    )
  );
  if (componentCodes.length === 0) return;

  const rowsByProvider = new Map<string, ComponentChargeRow[]>();
  for (const row of (componentRows as ComponentChargeRow[] | null) ?? []) {
    const existing = rowsByProvider.get(row.provider_id) || [];
    existing.push(row);
    rowsByProvider.set(row.provider_id, existing);
  }

  for (const idx of matchingIndices) {
    const result = enrichedResults[idx];
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes,
      providerRows: rowsByProvider.get(result.provider.id) || [],
      principal: result,
    });

    if (estimate && isEstimateDisplayable(estimate)) {
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
