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
  /**
   * What a real DRG row for this stay says. Some hospital files put revenue
   * codes in the DRG column (0460 pulmonary function shows up as DRG 460),
   * so a stay price only counts when the row describes the stay.
   */
  describes: RegExp;
}

// FY2024+ files code thoracic/lumbar fusion as 402, 426-428, 447-448 and
// 450-451; many still use the older 453-460.
const SPINAL_FUSION: InpatientStay = {
  label: "spinal fusion",
  drgs: [
    "402",
    "426",
    "427",
    "428",
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
  ],
  typicalDrgs: ["451", "460", "402", "455"],
  describes: /spinal|spine/i,
};

const HIP_REPLACEMENT: InpatientStay = {
  label: "hip replacement",
  drgs: ["469", "470", "521", "522"],
  typicalDrgs: ["470", "522"],
  describes: /hip|knee|joint/i,
};

const WEIGHT_LOSS_SURGERY: InpatientStay = {
  label: "weight-loss surgery",
  drgs: ["619", "620", "621"],
  typicalDrgs: ["621", "620"],
  describes: /obes|bariatric/i,
};

const VAGINAL_DELIVERY: InpatientStay = {
  label: "vaginal delivery",
  drgs: ["805", "806", "807"],
  typicalDrgs: ["807", "806"],
  describes: /vaginal/i,
};

const C_SECTION: InpatientStay = {
  label: "C-section delivery",
  drgs: ["783", "784", "785", "786", "787", "788"],
  typicalDrgs: ["788", "787", "785"],
  describes: /cesarean|c-section/i,
};

const INPATIENT_STAYS: Array<[number, number, InpatientStay]> = [
  [
    33510,
    33548,
    {
      label: "heart bypass surgery",
      drgs: ["231", "232", "233", "234", "235", "236"],
      typicalDrgs: ["236", "234", "232"],
      describes: /bypass|cabg|coronary/i,
    },
  ],
  [
    33400,
    33496,
    {
      label: "heart valve surgery",
      drgs: ["216", "217", "218", "219", "220", "221"],
      typicalDrgs: ["221", "220", "218", "217"],
      describes: /valve|cardiothoracic/i,
    },
  ],
  [
    33935,
    33945,
    {
      label: "heart transplant",
      drgs: ["001", "002"],
      typicalDrgs: ["002"],
      describes: /transplant/i,
    },
  ],
  [
    43107,
    43124,
    {
      label: "esophagus removal",
      drgs: ["326", "327", "328"],
      typicalDrgs: ["328", "327"],
      describes: /stomach|esophag|duodenal/i,
    },
  ],
  [
    47135,
    47135,
    {
      label: "liver transplant",
      drgs: ["005", "006"],
      typicalDrgs: ["006"],
      describes: /transplant/i,
    },
  ],
  [
    48150,
    48155,
    {
      label: "pancreas surgery",
      drgs: ["405", "406", "407"],
      typicalDrgs: ["407", "406"],
      describes: /pancreas|liver|shunt/i,
    },
  ],
  [
    50360,
    50365,
    {
      label: "kidney transplant",
      drgs: ["652"],
      typicalDrgs: ["652"],
      describes: /transplant/i,
    },
  ],
  // Thoracic/lumbar only: cervical fusion groups to DRGs 471-473.
  [22556, 22558, SPINAL_FUSION],
  [22610, 22634, SPINAL_FUSION],
  // Partial hip replacement is mostly done for a hip fracture (DRG 521-522).
  [27125, 27125, { ...HIP_REPLACEMENT, typicalDrgs: ["522", "470"] }],
  [27130, 27130, HIP_REPLACEMENT],
  [
    27446,
    27447,
    {
      ...HIP_REPLACEMENT,
      label: "knee replacement",
      drgs: ["469", "470"],
      typicalDrgs: ["470"],
    },
  ],
  [43644, 43645, WEIGHT_LOSS_SURGERY],
  [43770, 43775, WEIGHT_LOSS_SURGERY],
  [43842, 43848, WEIGHT_LOSS_SURGERY],
  [59400, 59410, VAGINAL_DELIVERY],
  [59510, 59525, C_SECTION],
  // Vaginal birth after a previous C-section, and the attempts that end in one.
  [59610, 59614, VAGINAL_DELIVERY],
  [59618, 59622, C_SECTION],
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
