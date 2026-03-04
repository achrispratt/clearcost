/**
 * Parse laterality (left/right/bilateral) from charge description and modifier fields.
 *
 * Used by the import pipeline (new rows) and the backfill script (existing rows).
 * A matching SQL function (parse_laterality) in scripts/migration-laterality.sql
 * mirrors this logic for in-database backfill.
 */

export type Laterality = "left" | "right" | "bilateral";

/**
 * Extract laterality from a charge's description and modifiers fields.
 *
 * Priority order:
 *   1. Modifiers field — CMS standard modifier codes (LT, RT, 50)
 *   2. Suffix abbreviations in description — word-boundary RT, LT, BI
 *   3. Full words in description — LEFT, RIGHT, BILATERAL, BILAT
 *   4. No match → null
 */
export function parseLaterality(
  description: string | null | undefined,
  modifiers: string | null | undefined
): Laterality | null {
  // Priority 1: Modifiers field (highest reliability)
  if (modifiers) {
    const mods = modifiers.toUpperCase();
    // Check for modifier 50 (bilateral) first — it's a single code
    if (/\b50\b/.test(mods)) return "bilateral";
    if (/\bLT\b/.test(mods)) return "left";
    if (/\bRT\b/.test(mods)) return "right";
  }

  // Priority 2 & 3: Description text
  if (description) {
    const desc = description.toUpperCase();

    // Priority 2: Suffix abbreviations (word-boundary)
    if (/\bBI\b/.test(desc)) return "bilateral";
    if (/\bLT\b/.test(desc)) return "left";
    if (/\bRT\b/.test(desc)) return "right";

    // Priority 3: Full words
    if (/\bBILATERAL\b/.test(desc) || /\bBILAT\b/.test(desc)) return "bilateral";
    if (/\bLEFT\b/.test(desc)) return "left";
    if (/\bRIGHT\b/.test(desc)) return "right";
  }

  return null;
}
