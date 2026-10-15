import finalCodes from "@/lib/data/final-codes.json";
import sspExpansion from "@/lib/data/import-sets/ssp-expansion.json";
import inpatientStayDrgs from "@/lib/data/import-sets/inpatient-stay-drgs.json";
import { normalizeCodeValue } from "./body-site-laterality-constants";
import type { CPTCode } from "@/types";

/**
 * Every code the import pipeline loads prices for: the curated list plus the
 * targeted import sets. A model-returned code outside this set has no price
 * rows of its own, so it can only add noise to results and the KB cache.
 */
const IMPORTED_CODES: ReadonlySet<string> = new Set(
  [...finalCodes, ...sspExpansion, ...inpatientStayDrgs].map(normalizeCodeValue)
);

export function isImportedCode(code: string): boolean {
  return IMPORTED_CODES.has(normalizeCodeValue(code));
}

/**
 * Drops model-returned codes we never import. If none survive, the original
 * list is kept so the search still falls back to description matching
 * instead of silently returning nothing.
 */
export function filterToImportedCodes(codes: CPTCode[]): CPTCode[] {
  const kept = codes.filter((code) => isImportedCode(code.code));
  return kept.length > 0 ? kept : codes;
}
