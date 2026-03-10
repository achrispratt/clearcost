/**
 * Shared validation constants and extraction helpers for laterality and body site.
 *
 * Used by translate.ts (parsing Claude responses) and pricing-plan.ts
 * (normalizing pricing plan input). Single source of truth for valid values.
 */

import type { BodySite, Laterality } from "@/types";

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

export function extractLaterality(value: unknown): Laterality | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_LATERALITIES.has(value as Laterality)
    ? (value as Laterality)
    : undefined;
}

export function extractBodySite(value: unknown): BodySite | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_BODY_SITES.has(value as BodySite)
    ? (value as BodySite)
    : undefined;
}
