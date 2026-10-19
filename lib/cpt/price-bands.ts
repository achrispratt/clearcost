import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChargeResult } from "@/types";
import { reportError } from "@/lib/observability";

/**
 * Some hospital files carry prices that can't be real for the code: a $4.41
 * knee MRI, a $6,089 blood count (#194). A price more than this many times
 * below or above the national typical price for its code (and fee type) is
 * treated as missing, like the placeholder rule in price-sanity.ts. Wrong
 * data is worse than none.
 */
export const BAND_FACTOR = 10;

/**
 * Stays (MS-DRG) are priced for the whole stay, so real prices sit much closer
 * together: a $1,920 hip replacement stay is a daily or partial rate, not the
 * stay. A stay price more than this many times under the typical one for its
 * DRG is treated as missing.
 */
export const STAY_LOW_FACTOR = 4;

/** HCPCS Level II codes are often per unit of a drug or supply; left alone. */
const HCPCS_LEVEL_II = /^[A-V]\d{4}$/;

/** Typical price keyed by `${code}|${professional}`. */
export type PriceReference = Map<string, number>;

function referenceKey(code: string, professional: boolean): string {
  return `${code}|${professional}`;
}

/** Reference key for a stay; matches refresh_code_price_reference(). */
function stayCode(drg: string): string | undefined {
  const key = drg.trim().replace(/^0+(?=\d)/, "");
  return key ? `drg:${key}` : undefined;
}

function isStay(result: ChargeResult): boolean {
  return !!result.msDrg && !result.cpt && !result.hcpcs;
}

function bandCode(result: ChargeResult): string | undefined {
  if (isStay(result)) return stayCode(result.msDrg as string);
  const code = (result.cpt ?? result.hcpcs)?.trim().toUpperCase();
  if (!code || HCPCS_LEVEL_II.test(code)) return undefined;
  return code;
}

function isProfessional(result: ChargeResult): boolean {
  return result.billingClass?.trim().toLowerCase() === "professional";
}

/** Loads typical prices for the codes in these results. Empty on failure. */
export async function loadPriceReference(
  supabase: SupabaseClient,
  results: ChargeResult[]
): Promise<PriceReference> {
  const codes = [
    ...new Set(results.map(bandCode).filter((c): c is string => !!c)),
  ];
  const reference: PriceReference = new Map();
  if (codes.length === 0) return reference;

  const { data, error } = await supabase
    .from("code_price_reference")
    .select("code, professional, typical_price")
    .in("code", codes);
  if (error) {
    // Without the reference, show prices unbanded rather than fail the search.
    reportError(error, "Price reference lookup failed:");
    return reference;
  }
  for (const row of data ?? []) {
    reference.set(
      referenceKey(row.code, row.professional),
      Number(row.typical_price)
    );
  }
  return reference;
}

function inBand(
  value: number | undefined,
  typical: number,
  checkHigh = true,
  lowFactor = BAND_FACTOR
): boolean {
  if (value == null) return true;
  if (value < typical / lowFactor) return false;
  return !checkHigh || value <= typical * BAND_FACTOR;
}

/** Clears cash, insured and list prices that are implausible for the code. */
export function applyPriceBands(
  results: ChargeResult[],
  reference: PriceReference
): ChargeResult[] {
  if (reference.size === 0) return results;
  return results.map((r) => {
    const code = bandCode(r);
    if (!code) return r;
    const typical = reference.get(referenceKey(code, isProfessional(r)));
    if (typical == null || typical <= 0) return r;

    const low = isStay(r) ? STAY_LOW_FACTOR : BAND_FACTOR;
    const cashOk = inBand(r.cashPrice, typical, true, low);
    const insuredOk = inBand(r.avgNegotiatedRate, typical, true, low);
    // List prices are often many times the typical price and still real, so
    // only an impossibly low one is cleared.
    const grossOk = inBand(r.grossCharge, typical, false, low);
    if (cashOk && insuredOk && grossOk) return r;
    return {
      ...r,
      cashPrice: cashOk ? r.cashPrice : undefined,
      grossCharge: grossOk ? r.grossCharge : undefined,
      ...(insuredOk
        ? {}
        : {
            avgNegotiatedRate: undefined,
            minNegotiatedRate: undefined,
            maxNegotiatedRate: undefined,
          }),
    };
  });
}
