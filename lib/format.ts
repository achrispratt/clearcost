import type { ChargeResult } from "@/types";

export function formatPrice(price: number | undefined): string {
  if (price == null) return "N/A";
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// -- Display price waterfall: cash → insured estimate → unavailable --

export type DisplayPriceType = "cash" | "insured" | "unavailable";

export interface DisplayPrice {
  amount: number | undefined;
  label: string;
  type: DisplayPriceType;
}

export function getDisplayPrice(result: ChargeResult): DisplayPrice {
  if (result.cashPrice != null) {
    const label =
      result.baseLabel ||
      (result.pricingMode === "encounter_first"
        ? "Base estimate"
        : "Cash price");
    return { amount: result.cashPrice, label, type: "cash" };
  }
  if (result.avgNegotiatedRate != null) {
    return {
      amount: result.avgNegotiatedRate,
      label: "Avg insured estimate",
      type: "insured",
    };
  }
  return { amount: undefined, label: "", type: "unavailable" };
}

export function getDisplayPriceAmount(
  result: ChargeResult
): number | undefined {
  return getDisplayPrice(result).amount;
}

export function formatDisplayPrice(dp: DisplayPrice): string {
  if (dp.amount == null) return "N/A";
  const formatted = formatPrice(dp.amount);
  return dp.type === "insured" ? `~${formatted}` : formatted;
}

export function formatDistance(miles: number | undefined): string {
  if (miles == null) return "";
  return `${miles.toFixed(1)} mi`;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function formatBillingCode(result: {
  cpt?: string;
  hcpcs?: string;
  msDrg?: string;
}): string {
  if (result.cpt) return `CPT ${result.cpt}`;
  if (result.hcpcs) return `HCPCS ${result.hcpcs}`;
  if (result.msDrg) return `MS-DRG ${result.msDrg}`;
  return "";
}
