import type { CPTCode, ChargeResult } from "@/types";
import { getDisplayPrice, type DisplayPrice } from "@/lib/format";

// ============================================================================
// Answer-first results: turns the raw charge list into what the page says
// at the top ("Cash prices near you run $280 to $3,988") and the hospital
// entries below it. Pure functions so the wording rules are testable.
// ============================================================================

/** What part of the bill a price line covers. */
export type FeeScope = "facility" | "professional" | "complete";

export function feeScope(billingClass: string | undefined): FeeScope {
  const bc = billingClass?.trim().toLowerCase();
  if (bc === "facility") return "facility";
  if (bc === "professional") return "professional";
  return "complete";
}

/** One row in the hospital list: a price, and every location that lists it. */
export interface PriceEntry {
  /** Nearest location (results arrive sorted by distance). */
  primary: ChargeResult;
  /** All locations sharing this exact price line, nearest first. */
  locations: ChargeResult[];
  price: DisplayPrice;
  scope: FeeScope;
}

function priceFingerprint(r: ChargeResult): string {
  return [
    r.description?.trim().toLowerCase() ?? "",
    r.cpt ?? r.hcpcs ?? r.msDrg ?? "",
    r.billingClass?.trim().toLowerCase() ?? "",
    r.cashPrice ?? "",
    r.avgNegotiatedRate ?? "",
    r.minNegotiatedRate ?? "",
    r.maxNegotiatedRate ?? "",
    r.grossCharge ?? "",
    r.payerCount ?? "",
  ].join("|");
}

/**
 * Hospital systems often publish one price file for every building they own,
 * so the same line shows up at a cancer center, an imaging center and a
 * counseling office. Collapse identical lines into one entry with a location
 * count, keeping the order of first appearance.
 */
export function collapseSharedPriceLists(
  results: ChargeResult[]
): PriceEntry[] {
  const byKey = new Map<string, PriceEntry>();
  const entries: PriceEntry[] = [];

  for (const r of results) {
    const price = getDisplayPrice(r);
    // Lines without any price can't be "the same list"; keep them separate.
    const key = price.amount == null ? `solo::${r.id}` : priceFingerprint(r);
    const existing = byKey.get(key);
    if (existing) {
      existing.locations.push(r);
      continue;
    }
    const entry: PriceEntry = {
      primary: r,
      locations: [r],
      price,
      scope: feeScope(r.billingClass),
    };
    byKey.set(key, entry);
    entries.push(entry);
  }

  return entries;
}

// ----------------------------------------------------------------------------
// Procedures billed as a hospital stay
// ----------------------------------------------------------------------------

/**
 * CPT codes for surgery that is normally billed as a multi-day inpatient stay
 * (one MS-DRG bill for the stay plus separate surgeon and anesthesia fees).
 * Hospital files list these as single procedure lines, often only the
 * surgeon's fee, so a "price" for them is misleading. Kept deliberately
 * narrow: add a family only when it's clearly an inpatient-stay procedure.
 */
const INPATIENT_STAY_RANGES: Array<[number, number, string]> = [
  [33510, 33548, "heart bypass surgery"],
  [33400, 33496, "heart valve surgery"],
  [33935, 33945, "heart transplant"],
  [43107, 43124, "esophagus removal"],
  [47135, 47135, "liver transplant"],
  [48150, 48155, "pancreas surgery"],
  [50360, 50365, "kidney transplant"],
];

export function inpatientStayLabel(codes: CPTCode[]): string | null {
  for (const c of codes) {
    if (c.codeType && c.codeType !== "cpt") continue;
    if (!/^\d{5}$/.test(c.code)) continue;
    const n = Number(c.code);
    const hit = INPATIENT_STAY_RANGES.find(([lo, hi]) => n >= lo && n <= hi);
    if (hit) return hit[2];
  }
  return null;
}

// ----------------------------------------------------------------------------
// The answer card
// ----------------------------------------------------------------------------

export type AnswerState =
  | "priced"
  | "doctor_fees_only"
  | "inpatient_unpriced"
  | "no_prices";

export type PriceBasis = "cash" | "insured" | "mixed";

export interface AnswerSummary {
  state: AnswerState;
  /** Entries after collapsing shared price lists. */
  entries: PriceEntry[];
  /** Entries that have a usable price, cheapest first. */
  priced: PriceEntry[];
  low?: number;
  high?: number;
  median?: number;
  lowest?: PriceEntry;
  basis?: PriceBasis;
  /** Main fee scope of the priced lines (what the range covers). */
  scope?: FeeScope;
  /** Set when the procedure is normally billed as a hospital stay. */
  inpatientLabel?: string;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function majorityScope(entries: PriceEntry[]): FeeScope {
  const counts: Record<FeeScope, number> = {
    facility: 0,
    professional: 0,
    complete: 0,
  };
  for (const e of entries) counts[e.scope]++;
  return (Object.keys(counts) as FeeScope[]).reduce((a, b) =>
    counts[b] > counts[a] ? b : a
  );
}

export function summarizeAnswer(
  results: ChargeResult[],
  codes: CPTCode[]
): AnswerSummary {
  const entries = collapseSharedPriceLists(results);
  // List prices (chargemaster) are what almost nobody pays; they never set
  // the headline range.
  const priced = entries
    .filter(
      (e) =>
        e.price.amount != null &&
        e.price.amount > 0 &&
        (e.price.type === "cash" || e.price.type === "insured")
    )
    .sort((a, b) => (a.price.amount ?? 0) - (b.price.amount ?? 0));

  const inpatientLabel = inpatientStayLabel(codes) ?? undefined;
  const hasDrgPricing = results.some((r) => !!r.msDrg);

  if (inpatientLabel && !hasDrgPricing && results.length > 0) {
    const amounts = priced.map((e) => e.price.amount as number);
    return {
      state: "inpatient_unpriced",
      entries,
      priced,
      low: amounts[0],
      high: amounts[amounts.length - 1],
      inpatientLabel,
    };
  }

  if (priced.length === 0) {
    return { state: "no_prices", entries, priced };
  }

  const amounts = priced.map((e) => e.price.amount as number);
  const cashCount = priced.filter((e) => e.price.type === "cash").length;
  const basis: PriceBasis =
    cashCount === priced.length
      ? "cash"
      : cashCount === 0
        ? "insured"
        : "mixed";
  const scope = majorityScope(priced);

  return {
    state: priced.every((e) => e.scope === "professional")
      ? "doctor_fees_only"
      : "priced",
    entries,
    priced,
    low: amounts[0],
    high: amounts[amounts.length - 1],
    median: median(amounts),
    lowest: priced[0],
    basis,
    scope,
  };
}

/** Short label for what a single price is. */
export function priceTypeLabel(price: DisplayPrice): string {
  switch (price.type) {
    case "cash":
      return "cash";
    case "insured":
      return "insured avg";
    case "gross":
      return "list price";
    default:
      return "";
  }
}

export function scopeLabel(scope: FeeScope): string | null {
  if (scope === "facility") return "Hospital fee only";
  if (scope === "professional") return "Doctor's fee only";
  return null;
}
