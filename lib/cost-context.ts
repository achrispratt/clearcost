import type { CPTCode, ChargeResult } from "@/types";

export interface AdderEstimate {
  label: string;
  low: number;
  high: number;
}

export interface CostContextMessage {
  message: string;
  estimates: AdderEstimate[];
  footnote?: string;
}

type CostPattern =
  | "surgery"
  | "imaging"
  | "cardiac"
  | "lab"
  | "therapy"
  | "injection"
  | "procedure";

// Full standalone messages (used when no price estimates available)
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

// Short intro messages (used when estimates follow as a bullet list)
// Only patterns with ADDER_DEFS entries need intros — others always use MESSAGES.
const INTROS: Partial<Record<CostPattern, string>> = {
  surgery: "This is the facility/surgeon fee. Additional costs may include:",
  imaging: "This is the imaging fee. Additional costs may include:",
  cardiac: "This is the test fee. Additional costs may include:",
  lab: "This is the lab test fee. Additional costs may include:",
  procedure: "Additional costs may include:",
};

const INPATIENT_NOTE =
  "For inpatient stays, room & board and daily physician visit charges also typically apply.";

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

// Adder estimation ratios (industry benchmarks)
interface AdderDef {
  label: string;
  lowPct: number;
  highPct: number;
  flat?: [number, number];
}

const ADDER_DEFS: Partial<Record<CostPattern, AdderDef[]>> = {
  surgery: [{ label: "Anesthesia", lowPct: 0.15, highPct: 0.25 }],
  imaging: [{ label: "Radiologist reading fee", lowPct: 0.2, highPct: 0.4 }],
  cardiac: [{ label: "Interpretation fee", lowPct: 0.2, highPct: 0.35 }],
  lab: [
    { label: "Specimen collection fee", lowPct: 0, highPct: 0, flat: [5, 25] },
  ],
};

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

function computeEstimates(
  pattern: CostPattern,
  results: ChargeResult[]
): AdderEstimate[] {
  const defs = ADDER_DEFS[pattern];
  if (!defs) return [];

  const prices = results
    .map((r) => r.cashPrice ?? r.minPrice)
    .filter((p): p is number => p != null && p > 0);

  const pMin = prices.length > 0 ? Math.min(...prices) : 0;
  const pMax = prices.length > 0 ? Math.max(...prices) : 0;

  return defs
    .map((d) => {
      if (d.flat) return { label: d.label, low: d.flat[0], high: d.flat[1] };
      if (pMin === 0) return null;
      return {
        label: d.label,
        low: Math.round(pMin * d.lowPct),
        high: Math.round(pMax * d.highPct),
      };
    })
    .filter((e): e is AdderEstimate => e != null && e.high > 0);
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

  // If generic "procedure" won but code range is more specific, prefer that.
  // Fixes: category like "Diagnostic Procedure" matching the catch-all keyword
  // before the code range (e.g., 70xxx → imaging) gets a chance.
  if (bestPattern === "procedure") {
    const firstCode = cptCodes[0]?.code;
    if (firstCode) {
      const rangeMatch = matchCodeRange(firstCode);
      if (rangeMatch && rangeMatch !== "procedure") {
        bestPattern = rangeMatch;
      }
    }
  }

  const hasInpatient =
    (bestPattern === "surgery" || bestPattern === "procedure") &&
    results.some((r) => r.setting === "inpatient");

  const estimates = computeEstimates(bestPattern, results);

  let message: string;
  let footnote: string | undefined;

  if (estimates.length > 0 && INTROS[bestPattern]) {
    message = INTROS[bestPattern];
    footnote = hasInpatient ? INPATIENT_NOTE : undefined;
  } else {
    message = MESSAGES[bestPattern];
    if (hasInpatient) message += ` ${INPATIENT_NOTE}`;
  }

  return { message, estimates, footnote };
}
