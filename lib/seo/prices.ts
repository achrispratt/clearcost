import type { SupabaseClient } from "@supabase/supabase-js";
import { createLookupDiagnostics, lookupCharges } from "@/lib/cpt/lookup";
import { groupResultsByProvider } from "@/lib/cpt/group-results";
import { getDisplayPrice } from "@/lib/format";
import {
  pricedCount,
  summarizeAnswer,
  type AnswerSummary,
} from "@/lib/results/summarize";
import type { CPTCode, ChargeResult } from "@/types";
import type { SeoMetro } from "./metros";
import type { SeoProcedure } from "./procedures";

export const SEO_RADIUS_MILES = 25;

/**
 * A page is only published when at least this many hospitals near the city
 * list a usable price. Fewer than that isn't a comparison, and a thin page
 * would rank for a price we can't really back up.
 */
export const MIN_PRICED_HOSPITALS = 3;

/**
 * Some hospital files carry prices that can't be real for the code: a $4 knee
 * MRI, a $6,000 blood count. A price more than this many times below or above
 * the national typical price for the procedure is left off the page.
 */
export const OUTLIER_FACTOR = 10;

export function procedureCodes(procedure: SeoProcedure): CPTCode[] {
  return [
    {
      code: procedure.code,
      codeType: procedure.codeType,
      description: procedure.name,
      category: procedure.category,
    },
  ];
}

/** Hospital results for one procedure near one city, grouped by provider. */
export async function getCityResults(
  procedure: SeoProcedure,
  metro: SeoMetro,
  supabase: SupabaseClient
): Promise<ChargeResult[]> {
  const diagnostics = createLookupDiagnostics();
  const results = await lookupCharges(
    {
      codes: [procedure.code],
      codeType: procedure.codeType,
      lat: metro.lat,
      lng: metro.lng,
      radiusMiles: SEO_RADIUS_MILES,
      bodySite: procedure.bodySite,
    },
    { supabase, stage: "seo", diagnostics }
  );
  // A failed lookup must not read as "no prices": the page would be cached
  // as a 404. Throwing serves an error now and keeps any cached copy.
  if (
    diagnostics.totalRpcAttempts > 0 &&
    diagnostics.totalFailures === diagnostics.totalRpcAttempts
  ) {
    throw new Error(
      `Price lookup failed for ${procedure.slug} near ${metro.slug}`
    );
  }
  return groupResultsByProvider(results);
}

/** Drops results whose price is implausibly far from the national typical. */
export function withoutOutliers(
  results: ChargeResult[],
  nationalMedian: number
): ChargeResult[] {
  const low = nationalMedian / OUTLIER_FACTOR;
  const high = nationalMedian * OUTLIER_FACTOR;
  return results.filter((r) => {
    const amount = getDisplayPrice(r).amount;
    return amount == null || (amount >= low && amount <= high);
  });
}

/** Summarizes city results like the results page, minus outlier prices. */
export function summarizeCity(
  procedure: SeoProcedure,
  results: ChargeResult[],
  nationalMedian: number
): AnswerSummary {
  return summarizeAnswer(
    withoutOutliers(results, nationalMedian),
    procedureCodes(procedure)
  );
}

/** Whether a summary has enough real prices to publish a page for it. */
export function isPublishable(summary: AnswerSummary): boolean {
  return (
    summary.state === "priced" && pricedCount(summary) >= MIN_PRICED_HOSPITALS
  );
}
