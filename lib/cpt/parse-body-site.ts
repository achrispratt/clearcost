/**
 * Parse body site from charge description text.
 *
 * Used by the import pipeline (new rows) and the backfill script (existing rows).
 * A matching SQL function (parse_body_site) in scripts/migration-body-site.sql
 * mirrors this logic for in-database backfill.
 */

// Relative import — this file is used by import-trilliant.ts which runs via
// npx tsx outside Next.js, so the @/ path alias doesn't resolve.
import type { BodySite } from "../../types";

/**
 * Body-site patterns ordered most-specific-first.
 * Generic terms like "LOW EXTREMITY JOINT" intentionally return null —
 * safer to show all body sites than guess wrong.
 */
const BODY_SITE_PATTERNS: Array<{ regex: RegExp; site: BodySite }> = [
  // Joints — most specific first
  { regex: /\bKNEE\b/, site: "knee" },
  { regex: /\bHIP\b/, site: "hip" },
  { regex: /\bANKLE\b/, site: "ankle" },
  { regex: /\bSHOULDER\b/, site: "shoulder" },
  { regex: /\bELBOW\b/, site: "elbow" },
  { regex: /\bWRIST\b/, site: "wrist" },
  { regex: /\bHAND\b/, site: "hand" },
  { regex: /\bFOOT\b|\bFEET\b/, site: "foot" },

  // Spine segments
  { regex: /\bCERVICAL\b|\bC[\s-]?SPINE\b/, site: "cervical_spine" },
  { regex: /\bTHORACIC\b|\bT[\s-]?SPINE\b/, site: "thoracic_spine" },
  { regex: /\bLUMBAR\b|\bL[\s-]?SPINE\b/, site: "lumbar_spine" },
  { regex: /\bSACRAL\b|\bSACRUM\b/, site: "sacral_spine" },

  // Torso/body regions
  { regex: /\bCHEST\b/, site: "chest" },
  { regex: /\bABDOMEN\b|\bABDOMINAL\b/, site: "abdomen" },
  { regex: /\bPELVI[SC]\b/, site: "pelvis" },

  // Head/neck
  { regex: /\bHEAD\b|\bBRAIN\b|\bCRANIAL\b/, site: "head" },
  { regex: /\bNECK\b/, site: "neck" },
];

/**
 * Patterns that indicate a generic/multi-site description.
 * When these match, we return null to avoid guessing wrong.
 */
const GENERIC_EXCLUSIONS = [
  /\bLOW(?:ER)?\s+EXTREMITY\s+JOINT\b/,
  /\bUPPER\s+EXTREMITY\s+JOINT\b/,
  /\bANY\s+JOINT\b/,
];

/**
 * Extract body site from a charge description.
 *
 * Returns the most specific body site found, or null if the description
 * is generic, missing, or doesn't match any known pattern.
 */
export function parseBodySite(
  description: string | null | undefined
): BodySite | null {
  if (!description) return null;

  const desc = description.toUpperCase();

  // Bail on generic multi-site descriptions
  for (const exclusion of GENERIC_EXCLUSIONS) {
    if (exclusion.test(desc)) return null;
  }

  // Match most-specific-first
  for (const { regex, site } of BODY_SITE_PATTERNS) {
    if (regex.test(desc)) return site;
  }

  return null;
}
