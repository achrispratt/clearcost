/**
 * Shared validation constants and extraction helpers for laterality and body site.
 *
 * Used by translate.ts (parsing Claude responses) and pricing-plan.ts
 * (normalizing pricing plan input). Single source of truth for valid values.
 */

import type { BillingCodeType, BodySite, Laterality } from "@/types";

export function normalizeCodeType(value: unknown): BillingCodeType {
  if (value === "hcpcs" || value === "ms_drg") return value;
  return "cpt";
}

export function normalizeCodeValue(code: string): string {
  return code.trim().toUpperCase();
}

export const VALID_LATERALITIES: ReadonlySet<Laterality> = new Set([
  "left",
  "right",
  "bilateral",
]);

export const VALID_BODY_SITES: ReadonlySet<BodySite> = new Set([
  "knee",
  "hip",
  "ankle",
  "shoulder",
  "elbow",
  "wrist",
  "hand",
  "foot",
  "cervical_spine",
  "thoracic_spine",
  "lumbar_spine",
  "sacral_spine",
  "chest",
  "abdomen",
  "pelvis",
  "head",
  "neck",
]);

function extractFromSet<T extends string>(
  set: ReadonlySet<T>,
  value: unknown
): T | undefined {
  if (typeof value !== "string") return undefined;
  return set.has(value as T) ? (value as T) : undefined;
}

export function extractLaterality(value: unknown): Laterality | undefined {
  return extractFromSet(VALID_LATERALITIES, value);
}

export function extractBodySite(value: unknown): BodySite | undefined {
  return extractFromSet(VALID_BODY_SITES, value);
}
