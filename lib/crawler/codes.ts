// Which billing codes the crawler keeps. Defaults to the same list the
// Trilliant import uses (lib/data/final-codes.json) plus the hospital-stay
// DRGs (lib/data/import-sets/inpatient-stay-drgs.json) and the surgical and
// obstetric stay DRGs #173 wants priced.

import { readFileSync } from "fs";
import { resolve } from "path";

import type { RawCode } from "./types";

/**
 * Stay DRGs #173 asks for that are not in either import list yet: spinal
 * fusion, joint replacement, bariatric surgery, C-section, vaginal delivery.
 * 453-455 and 459-460 are older spinal fusion DRGs; current files code those
 * stays as 402, 426-430, 447-448 and 450-451, so both sets are listed.
 */
export const ISSUE_173_DRGS = [
  "402",
  "426",
  "427",
  "428",
  "429",
  "430",
  "447",
  "448",
  "450",
  "451",
  "453",
  "454",
  "455",
  "456",
  "457",
  "458",
  "459",
  "460",
  "469",
  "470",
  "521",
  "522",
  "619",
  "620",
  "621",
  "783",
  "784",
  "785",
  "786",
  "787",
  "788",
  "805",
  "806",
  "807",
];

export interface CodeSet {
  /** CPT and HCPCS codes, upper-case. */
  procedures: Set<string>;
  /** MS-DRGs, zero-padded to three digits. */
  drgs: Set<string>;
}

type CodeColumn = "cpt" | "hcpcs" | "ms_drg";

/** "5", "005", "MS-DRG 005" → "005". Returns null for anything else. */
export function normalizeDrg(code: string): string | null {
  const digits = code.replace(/^\s*(MS-?)?DRG\s*/i, "").trim();
  if (!/^\d{1,4}$/.test(digits)) return null;
  const n = Number(digits);
  return n >= 1 && n <= 999 ? String(n).padStart(3, "0") : null;
}

/**
 * Split a flat code list into procedures and DRGs. Three-digit entries
 * (or fewer, as in inpatient-stay-drgs.json) are DRGs; CPT/HCPCS are five.
 */
export function buildCodeSet(codes: string[]): CodeSet {
  const set: CodeSet = { procedures: new Set(), drgs: new Set() };
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    if (/^\d{1,3}$/.test(code)) {
      const drg = normalizeDrg(code);
      if (drg) set.drgs.add(drg);
    } else if (code) {
      set.procedures.add(code);
    }
  }
  return set;
}

export function loadDefaultCodeSet(repoRoot: string): CodeSet {
  const read = (path: string): string[] =>
    JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
  return buildCodeSet([
    ...read("lib/data/final-codes.json"),
    ...read("lib/data/import-sets/inpatient-stay-drgs.json"),
    ...ISSUE_173_DRGS,
  ]);
}

const DRG_TYPES = new Set(["MS-DRG", "MSDRG", "DRG"]);

/**
 * Place a file's code in the charges column it belongs to, if it is one we
 * keep. CPT and HCPCS go where the file put them (hospitals often label CPT
 * codes as HCPCS, which the import also keeps as-is). "DRG" is read as
 * MS-DRG; APR-DRG and other groupers are different code systems and skipped.
 */
export function classifyCode(
  raw: RawCode,
  codeSet: CodeSet
): { column: CodeColumn; code: string } | null {
  const type = raw.type.trim().toUpperCase().replace(/\s+/g, "");
  if (type === "CPT" || type === "HCPCS") {
    const code = raw.code.trim().toUpperCase();
    if (!codeSet.procedures.has(code)) return null;
    return { column: type === "CPT" ? "cpt" : "hcpcs", code };
  }
  if (DRG_TYPES.has(type)) {
    const code = normalizeDrg(raw.code);
    return code && codeSet.drgs.has(code) ? { column: "ms_drg", code } : null;
  }
  return null;
}

/** True when any of the item's codes is in the set. */
export function hasWantedCode(codes: RawCode[], codeSet: CodeSet): boolean {
  return codes.some((c) => classifyCode(c, codeSet) !== null);
}
