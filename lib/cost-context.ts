import type { CPTCode, ChargeResult } from "@/types";

export interface CostContextMessage {
  message: string;
}

type CostPattern =
  | "surgery"
  | "imaging"
  | "cardiac"
  | "lab"
  | "therapy"
  | "injection"
  | "procedure";

const MESSAGES: Record<CostPattern, string> = {
  surgery:
    "This is the facility/surgeon fee. Your total cost may also include anesthesia, hospital stay, and post-op rehabilitation.",
  imaging:
    "This is the imaging fee. A separate radiologist reading fee may also apply.",
  cardiac:
    "This is the test fee. A separate cardiologist interpretation fee may also apply.",
  lab: "This is the lab test fee. A separate specimen collection or draw fee may apply.",
  therapy:
    "Individual session fee. Most treatment plans require multiple sessions over several weeks.",
  injection:
    "This is the administration fee. The drug or medication cost may be billed separately.",
  procedure:
    "Additional costs such as anesthesia or facility fees may apply separately.",
};

const INPATIENT_ADDENDUM =
  " For inpatient stays, room & board and daily physician visit charges also typically apply.";

// Ordered keyword rules — first match wins within each pattern
const KEYWORD_RULES: [RegExp, CostPattern | null][] = [
  [/surg|orthop|scopy|gastro/, "surgery"],
  [/radio|imag|mri|ct |xray|x-ray|ultrasound|nuclear|mammog/, "imaging"],
  [/cardi|echo|ekg|electro/, "cardiac"],
  [/lab|patho|blood/, "lab"],
  [/therap|rehab|physical med/, "therapy"],
  [/inject|infus/, "injection"],
  [/office|visit|emergency|e&m|prevent|screen|consult|evaluation/, null],
  [/procedure/, "procedure"],
];

// Priority for resolving multiple categories (highest first)
const PRIORITY: (CostPattern | null)[] = [
  "surgery",
  "imaging",
  "cardiac",
  "lab",
  "therapy",
  "injection",
  "procedure",
  null,
];

function matchKeyword(category: string): CostPattern | null | undefined {
  for (const [regex, pattern] of KEYWORD_RULES) {
    if (regex.test(category)) return pattern;
  }
  return undefined; // no keyword match — distinct from null (explicit E&M)
}

function matchCodeRange(code: string): CostPattern | null | undefined {
  // HCPCS codes start with a letter — too varied for reliable mapping
  if (/^[a-zA-Z]/.test(code)) return undefined;

  const num = parseInt(code, 10);
  if (isNaN(num)) return undefined;

  if (num >= 10000 && num <= 69999) return "surgery";
  if (num >= 70000 && num <= 79999) return "imaging";
  if (num >= 80000 && num <= 89999) return "lab";
  if (num >= 90000 && num <= 99199) return "procedure";
  if (num >= 99200 && num <= 99499) return null; // E&M
  return undefined;
}

export function getCostContext(
  cptCodes: CPTCode[],
  results: ChargeResult[]
): CostContextMessage | null {
  if (cptCodes.length === 0) return null;

  // Collect unique categories, try keyword match on each
  const matches = new Set<CostPattern | null>();
  let anyKeywordHit = false;

  for (const code of cptCodes) {
    if (!code.category) continue;
    const match = matchKeyword(code.category.toLowerCase());
    if (match !== undefined) {
      anyKeywordHit = true;
      matches.add(match);
    }
  }

  // Fallback: CPT code range of the first code (only if no keyword matched)
  if (!anyKeywordHit) {
    const firstCode = cptCodes[0]?.code;
    if (firstCode) {
      const rangeMatch = matchCodeRange(firstCode);
      if (rangeMatch !== undefined) matches.add(rangeMatch);
    }
  }

  if (matches.size === 0) return null;

  // Pick highest-priority pattern
  let bestPattern: CostPattern | null = null;
  for (const p of PRIORITY) {
    if (matches.has(p)) {
      bestPattern = p;
      break;
    }
  }

  // null means E&M/visit — no banner
  if (bestPattern === null) return null;

  let message = MESSAGES[bestPattern];

  // Append inpatient addendum for surgery/procedure when any result is inpatient
  if (
    (bestPattern === "surgery" || bestPattern === "procedure") &&
    results.some((r) => r.setting === "inpatient")
  ) {
    message += INPATIENT_ADDENDUM;
  }

  return { message };
}
