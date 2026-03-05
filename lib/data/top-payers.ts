/**
 * Top national health insurance payers for ClearCost.
 *
 * During import, we filter Trilliant Oria's ~6B negotiated rate rows to just
 * these payers. This keeps Supabase storage manageable while covering the
 * vast majority of commercially insured Americans.
 *
 * The `aliases` field helps match Oria's payer_name variations. During import,
 * we'll dynamically discover the top payers by COUNT(*) and merge with this
 * list for display name mapping.
 */

export interface PayerConfig {
  displayName: string;
  aliases: string[]; // Known name variations in MRF data (case-insensitive matching)
}

/**
 * Top 10 national payers by covered lives.
 * Order: approximate market share (largest first).
 */
export const TOP_PAYERS: Record<string, PayerConfig> = {
  UnitedHealthcare: {
    displayName: "UnitedHealthcare",
    aliases: [
      "unitedhealth",
      "united healthcare",
      "united health care",
      "uhc",
      "unitedhealthcare",
      "optum",
    ],
  },
  "Anthem / Elevance": {
    displayName: "Anthem / Elevance Health",
    aliases: [
      "anthem",
      "elevance",
      "elevance health",
      "anthem blue cross",
      "anthem bcbs",
    ],
  },
  Aetna: {
    displayName: "Aetna (CVS Health)",
    aliases: ["aetna", "cvs health", "aetna health"],
  },
  Cigna: {
    displayName: "Cigna Healthcare",
    aliases: ["cigna", "cigna healthcare", "cigna health", "evernorth"],
  },
  Humana: {
    displayName: "Humana",
    aliases: ["humana"],
  },
  "Blue Cross Blue Shield": {
    displayName: "Blue Cross Blue Shield",
    aliases: [
      "bcbs",
      "blue cross",
      "blue shield",
      "blue cross blue shield",
      "bluecross",
      "blueshield",
    ],
  },
  "Kaiser Permanente": {
    displayName: "Kaiser Permanente",
    aliases: ["kaiser", "kaiser permanente", "kaiser foundation"],
  },
  Centene: {
    displayName: "Centene / Ambetter",
    aliases: ["centene", "ambetter", "wellcare", "centene corporation"],
  },
  "Molina Healthcare": {
    displayName: "Molina Healthcare",
    aliases: ["molina", "molina healthcare"],
  },
  Medicare: {
    displayName: "Medicare",
    aliases: ["medicare", "cms", "centers for medicare"],
  },
};

let cachedAliasMap: Map<string, string> | null = null;

/**
 * Returns a flat list of all known payer name aliases (lowercased)
 * mapped to their canonical display name. Cached after first call
 * since TOP_PAYERS is static.
 */
export function buildPayerAliasMap(): Map<string, string> {
  if (cachedAliasMap) return cachedAliasMap;

  const map = new Map<string, string>();
  for (const [canonical, config] of Object.entries(TOP_PAYERS)) {
    map.set(canonical.toLowerCase(), config.displayName);
    for (const alias of config.aliases) {
      map.set(alias.toLowerCase(), config.displayName);
    }
  }
  cachedAliasMap = map;
  return map;
}

/**
 * Given a raw payer name from Oria data, attempt to match it to a known
 * top payer. Returns the display name if matched, null otherwise.
 *
 * Uses case-insensitive substring matching against known aliases.
 */
export function matchPayer(rawName: string): string | null {
  const lower = rawName.toLowerCase().trim();
  const aliasMap = buildPayerAliasMap();

  // Exact match first
  if (aliasMap.has(lower)) {
    return aliasMap.get(lower)!;
  }

  // Substring match (e.g., "UnitedHealthcare of New York" → "UnitedHealthcare")
  for (const [alias, displayName] of aliasMap.entries()) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return displayName;
    }
  }

  return null;
}
