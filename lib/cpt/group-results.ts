import type { ChargeResult, ChargeVariant, GroupedChargeResult } from "@/types";

function billingClassTier(bc: string | undefined): number {
  const normalized = bc?.toLowerCase();
  if (!normalized || normalized === "both") return 0; // global/most complete
  if (normalized === "facility") return 1;
  if (normalized === "professional") return 2;
  return 0; // unknown treated as potentially complete
}

// A procedure's price is its outpatient one. Hospital files also list the
// same code inside inpatient stays, at rates that belong to the stay.
function settingTier(result: ChargeResult): number {
  if (result.msDrg) return 0;
  return result.setting?.toLowerCase() === "inpatient" ? 1 : 0;
}

function priceTypeTier(result: ChargeResult): number {
  if (result.cashPrice != null) return 0;
  if (result.avgNegotiatedRate != null) return 1;
  if (result.grossCharge != null) return 2;
  return 3; // no price
}

function bestPrice(result: ChargeResult): number {
  return (
    result.cashPrice ??
    result.avgNegotiatedRate ??
    result.grossCharge ??
    Infinity
  );
}

/** Negative when a is lower; missing values sort last. */
function compareLow(a: number | undefined, b: number | undefined): number {
  const x = a ?? Infinity;
  const y = b ?? Infinity;
  return x === y ? 0 : x < y ? -1 : 1;
}

function selectPrimary(charges: ChargeResult[]): ChargeResult {
  return charges.reduce((best, cur) => {
    const tierDiff =
      billingClassTier(best.billingClass) - billingClassTier(cur.billingClass);
    if (tierDiff !== 0) return tierDiff < 0 ? best : cur;

    const settingDiff = settingTier(best) - settingTier(cur);
    if (settingDiff !== 0) return settingDiff < 0 ? best : cur;

    const priceTierDiff = priceTypeTier(best) - priceTypeTier(cur);
    if (priceTierDiff !== 0) return priceTierDiff < 0 ? best : cur;

    // Lowest headline price wins. On a tie, the other prices and then the
    // id decide, so the card doesn't change with the order rows come back in.
    const priceDiff =
      compareLow(bestPrice(best), bestPrice(cur)) ||
      compareLow(best.avgNegotiatedRate, cur.avgNegotiatedRate) ||
      compareLow(best.grossCharge, cur.grossCharge);
    if (priceDiff !== 0) return priceDiff < 0 ? best : cur;
    return best.id <= cur.id ? best : cur;
  });
}

function toVariant(result: ChargeResult): ChargeVariant {
  return {
    id: result.id,
    description: result.description,
    billingClass: result.billingClass,
    setting: result.setting,
    laterality: result.laterality,
    bodySite: result.bodySite,
    cashPrice: result.cashPrice,
    grossCharge: result.grossCharge,
    avgNegotiatedRate: result.avgNegotiatedRate,
    minPrice: result.minPrice,
    maxPrice: result.maxPrice,
    payerCount: result.payerCount,
    isDiscounted: result.isDiscounted,
  };
}

function groupingKey(result: ChargeResult): string {
  const code =
    result.cpt || result.hcpcs || result.msDrg || result.description || "";
  return `${result.provider.id}::${code}`;
}

export function groupResultsByProvider(
  results: ChargeResult[]
): GroupedChargeResult[] {
  const groups = new Map<string, ChargeResult[]>();

  for (const result of results) {
    // Pass through encounter-first cards ungrouped — already one-per-provider
    const key = result.id.includes("::encounter")
      ? `solo::${result.id}`
      : groupingKey(result);

    const existing = groups.get(key);
    if (existing) {
      existing.push(result);
    } else {
      groups.set(key, [result]);
    }
  }

  return Array.from(groups.values(), (charges) => {
    const primary = charges.length === 1 ? charges[0] : selectPrimary(charges);
    const variants = charges.map(toVariant);
    return {
      ...primary,
      chargeVariants: variants,
      variantCount: variants.length,
    };
  });
}
