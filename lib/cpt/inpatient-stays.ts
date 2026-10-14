import type { CPTCode } from "@/types";

// ============================================================================
// Procedures billed as a hospital stay (#173). Shared by the search route
// (which adds the stay's MS-DRGs to the lookup) and the results summary
// (which prices the stay from them).
// ============================================================================

export interface InpatientStay {
  label: string;
  /** Every MS-DRG the stay can be billed under (searched together). */
  drgs: string[];
  /**
   * DRGs for an uncomplicated stay, most typical first. Only these set the
   * price: the "with major complications" DRGs can cost several times more
   * and would overstate what most patients pay (#173).
   */
  typicalDrgs: string[];
}

const INPATIENT_STAYS: Array<[number, number, InpatientStay]> = [
  [
    33510,
    33548,
    {
      label: "heart bypass surgery",
      drgs: ["231", "232", "233", "234", "235", "236"],
      typicalDrgs: ["236", "234", "232"],
    },
  ],
  [
    33400,
    33496,
    {
      label: "heart valve surgery",
      drgs: ["216", "217", "218", "219", "220", "221"],
      typicalDrgs: ["221", "220", "218", "217"],
    },
  ],
  [
    33935,
    33945,
    {
      label: "heart transplant",
      drgs: ["001", "002"],
      typicalDrgs: ["002"],
    },
  ],
  [
    43107,
    43124,
    {
      label: "esophagus removal",
      drgs: ["326", "327", "328"],
      typicalDrgs: ["328", "327"],
    },
  ],
  [
    47135,
    47135,
    {
      label: "liver transplant",
      drgs: ["005", "006"],
      typicalDrgs: ["006"],
    },
  ],
  [
    48150,
    48155,
    {
      label: "pancreas surgery",
      drgs: ["405", "406", "407"],
      typicalDrgs: ["407", "406"],
    },
  ],
  [
    50360,
    50365,
    {
      label: "kidney transplant",
      drgs: ["652"],
      typicalDrgs: ["652"],
    },
  ],
];

/**
 * CPT codes for surgery that is normally billed as a multi-day inpatient stay
 * (one MS-DRG bill for the stay plus separate surgeon and anesthesia fees).
 * Hospital files list these as single procedure lines, often only the
 * surgeon's fee, so a CPT "price" for them is misleading. Kept deliberately
 * narrow: add a family only when it's clearly an inpatient-stay procedure.
 */
export function inpatientStayFor(
  codes: Array<Pick<CPTCode, "code" | "codeType">>
): InpatientStay | null {
  for (const c of codes) {
    if (c.codeType && c.codeType !== "cpt") continue;
    if (!/^\d{5}$/.test(c.code)) continue;
    const n = Number(c.code);
    const hit = INPATIENT_STAYS.find(([lo, hi]) => n >= lo && n <= hi);
    if (hit) return hit[2];
  }
  return null;
}
