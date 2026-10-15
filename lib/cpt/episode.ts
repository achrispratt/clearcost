import { createClient } from "@/lib/supabase/server";
import { median } from "@/lib/cpt/lookup";
import { plausiblePrice } from "@/lib/cpt/price-sanity";
import type {
  ChargeResult,
  EpisodeBillingClass,
  EpisodeConfidence,
  EpisodeEstimate,
  EpisodeLine,
  EpisodeLineSource,
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
  | "grossCharge"
  | "avgNegotiatedRate"
  | "minNegotiatedRate"
  | "maxNegotiatedRate"
>;

const MIN_ASSOCIATION = 0.4;
const MIN_COVERAGE_RATIO = 0.5;

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
// Cash-equivalent pricing
//
// Every line is expressed in cash dollars. A real cash price is used when the
// hospital publishes one; otherwise the insured average (or gross charge) is
// converted with a cash ratio, preferably this hospital's own, and the line is
// marked with lower confidence. Lines with nothing usable are reported as
// missing rather than borrowed from other hospitals.
// ---------------------------------------------------------------------------

/** Distribution of cash_price / other_price across one hospital's charges. */
export interface CashRatio {
  pairCount: number;
  q1: number;
  median: number;
  q3: number;
}

export interface ProviderCashRatios {
  insured?: CashRatio; // cash_price / avg_negotiated_rate
  gross?: CashRatio; // cash_price / gross_charge
}

// National fallbacks, measured on a 2% sample of charges on 2026-10-14
// (~97K cash/insured pairs, ~143K cash/gross pairs). Hospitals vary widely
// (hospital medians span ~0.5x-9.5x), so these always yield low confidence.
export const NATIONAL_CASH_RATIOS: Required<ProviderCashRatios> = {
  insured: { pairCount: 0, q1: 0.75, median: 1.13, q3: 1.91 },
  gross: { pairCount: 0, q1: 0.5, median: 0.65, q3: 1.0 },
};

// A hospital ratio needs this many priced pairs to be trusted over national.
const MIN_RATIO_PAIRS = 5;
// A hospital ratio whose interquartile range spans more than this is noisy.
const MAX_CONFIDENT_RATIO_SPREAD = 2.5;
// Estimate-level confidence thresholds.
const MAX_LOW_CONFIDENCE_SHARE = 0.25;
const MIN_CONFIDENT_COVERAGE = 0.75;

const CONFIDENCE_RANK: Record<EpisodeConfidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

function positive(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  return value;
}

type LinePrice = Omit<EpisodeLine, "code" | "isPrincipal">;

/** Pick the hospital's ratio when it has enough data, else the national one. */
function resolveRatio(
  hospital: CashRatio | undefined,
  national: CashRatio
): {
  ratio: CashRatio;
  scope: "hospital" | "national";
  confidence: EpisodeConfidence;
} {
  if (hospital && hospital.pairCount >= MIN_RATIO_PAIRS && hospital.q1 > 0) {
    const spread = hospital.q3 / hospital.q1;
    return {
      ratio: hospital,
      scope: "hospital",
      confidence: spread <= MAX_CONFIDENT_RATIO_SPREAD ? "medium" : "low",
    };
  }
  return { ratio: national, scope: "national", confidence: "low" };
}

function convert(
  values: { estimate: number; min: number; max: number }[],
  source: Exclude<EpisodeLineSource, "cash">,
  ratioInfo: ReturnType<typeof resolveRatio>
): LinePrice {
  const { ratio, scope, confidence } = ratioInfo;
  return {
    source,
    confidence,
    ratioScope: scope,
    estimate: median(values.map((v) => v.estimate)) * ratio.median,
    min: Math.min(...values.map((v) => v.min)) * ratio.q1,
    max: Math.max(...values.map((v) => v.max)) * ratio.q3,
  };
}

/**
 * Price one line (a hospital's rows for one code, which may be several, e.g.
 * per setting) in cash-equivalent dollars. Returns undefined when no row has
 * a cash, insured or gross price.
 */
export function priceLine(
  rows: ComponentChargeRow[],
  ratios: ProviderCashRatios
): LinePrice | undefined {
  const cash = rows
    .map((r) =>
      plausiblePrice(r.cash_price, r.component_code, r.min_negotiated_rate)
    )
    .filter((v): v is number => v != null);
  if (cash.length > 0) {
    return {
      source: "cash",
      confidence: "high",
      estimate: median(cash),
      min: Math.min(...cash),
      max: Math.max(...cash),
    };
  }

  const candidates: { line: LinePrice; spread: number }[] = [];

  const insured = rows.flatMap((r) => {
    const avg = positive(r.avg_negotiated_rate);
    if (avg == null) return [];
    return [
      {
        estimate: avg,
        min: positive(r.min_negotiated_rate) ?? avg,
        max: positive(r.max_negotiated_rate) ?? avg,
      },
    ];
  });
  if (insured.length > 0) {
    const info = resolveRatio(ratios.insured, NATIONAL_CASH_RATIOS.insured);
    candidates.push({
      line: convert(insured, "insured_converted", info),
      spread: info.ratio.q3 / info.ratio.q1,
    });
  }

  const gross = rows.flatMap((r) => {
    const g = plausiblePrice(
      r.gross_charge,
      r.component_code,
      r.min_negotiated_rate
    );
    return g == null ? [] : [{ estimate: g, min: g, max: g }];
  });
  if (gross.length > 0) {
    const info = resolveRatio(ratios.gross, NATIONAL_CASH_RATIOS.gross);
    candidates.push({
      line: convert(gross, "gross_converted", info),
      spread: info.ratio.q3 / info.ratio.q1,
    });
  }

  if (candidates.length === 0) return undefined;

  // Best confidence, then hospital-specific ratio, then the tighter ratio.
  // Ties keep insured first (it is pushed first and sort is stable).
  candidates.sort(
    (a, b) =>
      CONFIDENCE_RANK[b.line.confidence] - CONFIDENCE_RANK[a.line.confidence] ||
      Number(b.line.ratioScope === "hospital") -
        Number(a.line.ratioScope === "hospital") ||
      a.spread - b.spread
  );
  return candidates[0].line;
}

function principalAsRow(principal: PrincipalCharge): ComponentChargeRow {
  return {
    provider_id: "",
    component_code: "",
    component_code_type: "",
    component_tier: "required",
    component_association: 1,
    billing_class: principal.billingClass,
    cash_price: principal.cashPrice ?? null,
    gross_charge: principal.grossCharge ?? null,
    avg_negotiated_rate: principal.avgNegotiatedRate ?? null,
    min_negotiated_rate: principal.minNegotiatedRate ?? null,
    max_negotiated_rate: principal.maxNegotiatedRate ?? null,
    min_price: null,
    max_price: null,
  };
}

function overallConfidence(
  lines: EpisodeLine[],
  coverageRatio: number
): EpisodeConfidence {
  const total = lines.reduce((sum, l) => sum + l.estimate, 0);
  const lowShare =
    total > 0
      ? lines
          .filter((l) => l.confidence === "low")
          .reduce((sum, l) => sum + l.estimate, 0) / total
      : 1;
  if (lowShare > MAX_LOW_CONFIDENCE_SHARE) return "low";
  if (coverageRatio < MIN_CONFIDENT_COVERAGE) return "low";
  if (coverageRatio === 1 && lines.every((l) => l.confidence === "high")) {
    return "high";
  }
  return "medium";
}

// ---------------------------------------------------------------------------
// Build EpisodeEstimate for a single provider
// ---------------------------------------------------------------------------

/**
 * Build one hospital's cash-equivalent episode estimate from that hospital's
 * own charges only.
 *
 * - Every line is in cash dollars: a real cash price when published, else a
 *   converted insured or gross price, flagged with lower confidence.
 * - Every line is in the principal charge's billing class.
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
  ratios = {},
}: {
  episodeDef: EpisodeDefinitionRow;
  /** Episode component codes, excluding the principal code itself. */
  componentCodes: string[];
  /** This provider's component charge rows. */
  providerRows: ComponentChargeRow[];
  principal: PrincipalCharge;
  /** This provider's cash ratios; national fallbacks apply when absent. */
  ratios?: ProviderCashRatios;
}): EpisodeEstimate | undefined {
  const billingClass = episodeBillingClassFor(principal.billingClass);
  if (!billingClass) return undefined;

  const principalLine = priceLine([principalAsRow(principal)], ratios);
  if (!principalLine) return undefined;

  const rowsByCode = new Map<string, ComponentChargeRow[]>();
  for (const row of providerRows) {
    const code = row.component_code.trim().toUpperCase();
    const existing = rowsByCode.get(code) || [];
    existing.push(row);
    rowsByCode.set(code, existing);
  }

  const lines: EpisodeLine[] = [
    { code: episodeDef.principal_code, isPrincipal: true, ...principalLine },
  ];
  const missingCodes: string[] = [];

  for (const code of componentCodes) {
    const rows = eligibleRowsForClass(rowsByCode.get(code) || [], billingClass);
    const price = priceLine(rows, ratios);
    if (price) {
      lines.push({ code, isPrincipal: false, ...price });
    } else {
      missingCodes.push(code);
    }
  }

  const componentCount = componentCodes.length + 1;
  const coverageRatio = lines.length / componentCount;
  const cashLines = lines.filter((l) => l.source === "cash").length;

  return {
    episodeId: episodeDef.id,
    principalCode: episodeDef.principal_code,
    label: episodeDef.label,
    category: episodeDef.category ?? undefined,
    estimatedAllInMedian: lines.reduce((sum, l) => sum + l.estimate, 0),
    estimatedAllInMin: lines.reduce((sum, l) => sum + l.min, 0),
    estimatedAllInMax: lines.reduce((sum, l) => sum + l.max, 0),
    componentCount,
    priceableCount: lines.length,
    coverageRatio,
    cashCoverageRatio: cashLines / componentCount,
    confidence: overallConfidence(lines, coverageRatio),
    billingClass,
    lines,
    missingCodes,
    source: "turquoise_ssp",
  };
}

/** Whether an estimate prices enough of the episode to show. */
export function isEstimateDisplayable(estimate: EpisodeEstimate): boolean {
  return (
    estimate.priceableCount > 1 && estimate.coverageRatio >= MIN_COVERAGE_RATIO
  );
}

interface CashRatioRow {
  provider_id: string;
  ratio_type: "insured" | "gross";
  pair_count: number;
  q1: number;
  median: number;
  q3: number;
}

export function groupCashRatios(
  rows: CashRatioRow[]
): Map<string, ProviderCashRatios> {
  const byProvider = new Map<string, ProviderCashRatios>();
  for (const row of rows) {
    const ratios = byProvider.get(row.provider_id) || {};
    ratios[row.ratio_type] = {
      pairCount: Number(row.pair_count),
      q1: Number(row.q1),
      median: Number(row.median),
      q3: Number(row.q3),
    };
    byProvider.set(row.provider_id, ratios);
  }
  return byProvider;
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

  const [
    { data: componentDefs },
    { data: componentRows },
    { data: ratioRows },
  ] = await Promise.all([
    supabase
      .from("episode_components")
      .select("code")
      .eq("episode_id", episodeDef.id)
      .gte("association", MIN_ASSOCIATION)
      .in("code_type", ["cpt", "hcpcs"]),
    supabase.rpc("lookup_episode_component_charges_v2", {
      p_principal_code: principalCode,
      p_provider_ids: Array.from(providerIds),
      p_min_association: MIN_ASSOCIATION,
    }),
    supabase
      .from("provider_cash_ratios")
      .select("provider_id, ratio_type, pair_count, q1, median, q3")
      .in("provider_id", Array.from(providerIds)),
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

  const ratiosByProvider = groupCashRatios(
    (ratioRows as CashRatioRow[] | null) ?? []
  );

  for (const idx of matchingIndices) {
    const result = enrichedResults[idx];
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes,
      providerRows: rowsByProvider.get(result.provider.id) || [],
      principal: result,
      ratios: ratiosByProvider.get(result.provider.id),
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
