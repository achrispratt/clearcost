import type { CPTCode, ChargeResult } from "@/types";
import { getDisplayPrice, type DisplayPrice } from "@/lib/format";
import { inpatientStayFor } from "@/lib/cpt/inpatient-stays";

export { inpatientStayFor };

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

  // Lead each shared list with the nearest location that plausibly does the
  // procedure, not a counseling office or foundation center (#172).
  for (const entry of entries) {
    if (!isSupportSite(entry.primary)) continue;
    const clinical = entry.locations.find((l) => !isSupportSite(l));
    if (clinical) {
      entry.primary = clinical;
      entry.locations = [
        clinical,
        ...entry.locations.filter((l) => l !== clinical),
      ];
    }
  }

  return entries;
}

const SUPPORT_SITE =
  /\b(counseling|foundation|infusion|administrative|billing|business office|wellness|fitness|pharmacy)\b/i;

function isSupportSite(r: ChargeResult): boolean {
  return SUPPORT_SITE.test(r.provider.name ?? "");
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
export function inpatientStayLabel(codes: CPTCode[]): string | null {
  return inpatientStayFor(codes)?.label ?? null;
}

/** DRG codes are stored without leading zeros in some files ("2" vs "002"). */
function drgKey(code: string | undefined): string {
  return (code ?? "").trim().replace(/^0+(?=\d)/, "");
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
  /** How many entries the low/high/median range is drawn from. */
  rangeCount?: number;
  lowest?: PriceEntry;
  basis?: PriceBasis;
  /** Main fee scope of the priced lines (what the range covers). */
  scope?: FeeScope;
  /** Set when the procedure is normally billed as a hospital stay. */
  inpatientLabel?: string;
  /** MS-DRG the stay price comes from, when one is priced. */
  stayDrg?: string;
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

  const stay = inpatientStayFor(codes);
  const inpatientLabel = stay?.label;

  if (stay) {
    // Price the stay from the first typical-severity DRG (in preference
    // order) that has prices near the user. The single CPT lines (usually
    // the surgeon's fee) never set a stay price.
    const isStayRow = (r: ChargeResult, drg: string) =>
      drgKey(r.msDrg) === drgKey(drg) &&
      r.setting?.trim().toLowerCase() === "inpatient" &&
      stay.describes.test(r.description ?? "");
    const stayDrg = stay.typicalDrgs.find((d) =>
      priced.some((e) => isStayRow(e.primary, d))
    );
    if (stayDrg) {
      const stayEntries = priced
        .filter((e) => isStayRow(e.primary, stayDrg))
        .map((e) => ({ ...e, scope: "facility" as FeeScope }));
      const amounts = stayEntries.map((e) => e.price.amount as number);
      const cashCount = stayEntries.filter(
        (e) => e.price.type === "cash"
      ).length;
      return {
        state: "priced",
        entries: entries
          .filter((e) => isStayRow(e.primary, stayDrg))
          .map((e) => ({ ...e, scope: "facility" as FeeScope })),
        priced: stayEntries,
        low: amounts[0],
        high: amounts[amounts.length - 1],
        median: median(amounts),
        rangeCount: stayEntries.length,
        lowest: stayEntries[0],
        basis:
          cashCount === stayEntries.length
            ? "cash"
            : cashCount === 0
              ? "insured"
              : "mixed",
        scope: "facility",
        inpatientLabel,
        stayDrg,
      };
    }
  }

  if (inpatientLabel && results.length > 0) {
    // "Single lines we found": the CPT lines only, not complicated-stay DRGs.
    const amounts = priced
      .filter((e) => !e.primary.msDrg)
      .map((e) => e.price.amount as number);
    return {
      state: "inpatient_unpriced",
      entries: entries.filter((e) => !e.primary.msDrg),
      priced: priced.filter((e) => !e.primary.msDrg),
      low: amounts[0],
      high: amounts[amounts.length - 1],
      inpatientLabel,
    };
  }

  if (priced.length === 0) {
    return { state: "no_prices", entries, priced };
  }

  // A doctor's fee is a fraction of the procedure price, so when any hospital
  // lists a hospital-side or complete price, doctor-only lines don't set the
  // range or the "Lowest" tag (#174). They stay in the list, labeled.
  const hospitalSide = priced.filter((e) => e.scope !== "professional");
  const headline = hospitalSide.length > 0 ? hospitalSide : priced;

  const amounts = headline.map((e) => e.price.amount as number);
  const cashCount = headline.filter((e) => e.price.type === "cash").length;
  const basis: PriceBasis =
    cashCount === headline.length
      ? "cash"
      : cashCount === 0
        ? "insured"
        : "mixed";
  const scope = majorityScope(headline);

  return {
    state: hospitalSide.length === 0 ? "doctor_fees_only" : "priced",
    entries,
    priced,
    low: amounts[0],
    high: amounts[amounts.length - 1],
    median: median(amounts),
    rangeCount: headline.length,
    lowest: headline[0],
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
