import type { BillingCodeType, BodySite } from "@/types";

/**
 * Procedures that get a public price page per city (#24). Each one maps to a
 * single, unambiguous billing code, so the page never has to guess which
 * service a hospital line covers. Add a procedure only when one code fully
 * describes what a patient would ask for; anything that needs a diagnostic
 * conversation belongs in guided search instead.
 */
export interface SeoProcedure {
  slug: string;
  /** Plain-English name used in titles: "Knee MRI cost in Houston, TX". */
  name: string;
  /** What the code covers, in a patient's words. */
  summary: string;
  category: SeoCategory;
  codeType: BillingCodeType;
  code: string;
  /** Narrows codes shared by several joints (73721 covers knee, hip, ankle). */
  bodySite?: BodySite;
}

export type SeoCategory =
  | "Imaging"
  | "Lab tests"
  | "Heart and sleep tests"
  | "Scopes"
  | "Outpatient surgery";

export const SEO_CATEGORIES: SeoCategory[] = [
  "Imaging",
  "Lab tests",
  "Heart and sleep tests",
  "Scopes",
  "Outpatient surgery",
];

export const SEO_PROCEDURES: SeoProcedure[] = [
  // Imaging
  {
    slug: "knee-mri",
    name: "Knee MRI",
    summary: "MRI of the knee without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "73721",
    bodySite: "knee",
  },
  {
    slug: "shoulder-mri",
    name: "Shoulder MRI",
    summary: "MRI of the shoulder without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "73221",
    bodySite: "shoulder",
  },
  {
    slug: "lower-back-mri",
    name: "Lower back MRI",
    summary: "MRI of the lumbar spine without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "72148",
  },
  {
    slug: "brain-mri",
    name: "Brain MRI",
    summary: "MRI of the brain without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "70551",
  },
  {
    slug: "head-ct",
    name: "Head CT scan",
    summary: "CT scan of the head or brain without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "70450",
  },
  {
    slug: "chest-ct",
    name: "Chest CT scan",
    summary: "CT scan of the chest without contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "71250",
  },
  {
    slug: "abdomen-pelvis-ct",
    name: "Abdomen and pelvis CT scan",
    summary: "CT scan of the belly and pelvis with contrast dye.",
    category: "Imaging",
    codeType: "cpt",
    code: "74177",
  },
  {
    slug: "chest-x-ray",
    name: "Chest X-ray",
    summary: "Chest X-ray, two views.",
    category: "Imaging",
    codeType: "cpt",
    code: "71046",
  },
  {
    slug: "knee-x-ray",
    name: "Knee X-ray",
    summary: "X-ray of the knee, three views.",
    category: "Imaging",
    codeType: "cpt",
    code: "73562",
  },
  {
    slug: "screening-mammogram",
    name: "Screening mammogram",
    summary:
      "Routine screening mammogram of both breasts. 3D imaging is billed as an extra.",
    category: "Imaging",
    codeType: "cpt",
    code: "77067",
  },
  {
    slug: "diagnostic-mammogram",
    name: "Diagnostic mammogram",
    summary:
      "Mammogram of both breasts to check a lump or other symptom, not a routine screening.",
    category: "Imaging",
    codeType: "cpt",
    code: "77066",
  },
  {
    slug: "abdominal-ultrasound",
    name: "Abdominal ultrasound",
    summary: "Complete ultrasound of the belly.",
    category: "Imaging",
    codeType: "cpt",
    code: "76700",
  },
  {
    slug: "pelvic-ultrasound",
    name: "Pelvic ultrasound",
    summary: "Complete ultrasound of the pelvis through the abdomen.",
    category: "Imaging",
    codeType: "cpt",
    code: "76856",
  },
  {
    slug: "pregnancy-ultrasound",
    name: "Pregnancy ultrasound",
    summary:
      "Standard pregnancy ultrasound after the first trimester, one baby.",
    category: "Imaging",
    codeType: "cpt",
    code: "76805",
  },
  {
    slug: "thyroid-ultrasound",
    name: "Thyroid ultrasound",
    summary: "Ultrasound of the thyroid and neck.",
    category: "Imaging",
    codeType: "cpt",
    code: "76536",
  },
  {
    slug: "bone-density-scan",
    name: "Bone density scan (DEXA)",
    summary: "DEXA scan of the hips and spine to check for osteoporosis.",
    category: "Imaging",
    codeType: "cpt",
    code: "77080",
  },

  // Lab tests
  {
    slug: "complete-blood-count",
    name: "Complete blood count (CBC)",
    summary: "Automated blood count with differential.",
    category: "Lab tests",
    codeType: "cpt",
    code: "85025",
  },
  {
    slug: "comprehensive-metabolic-panel",
    name: "Comprehensive metabolic panel (CMP)",
    summary: "Blood test for kidney, liver, blood sugar and electrolytes.",
    category: "Lab tests",
    codeType: "cpt",
    code: "80053",
  },
  {
    slug: "basic-metabolic-panel",
    name: "Basic metabolic panel (BMP)",
    summary: "Blood test for kidney function, blood sugar and electrolytes.",
    category: "Lab tests",
    codeType: "cpt",
    code: "80048",
  },
  {
    slug: "cholesterol-test",
    name: "Cholesterol test (lipid panel)",
    summary: "Blood test for total, HDL and LDL cholesterol and triglycerides.",
    category: "Lab tests",
    codeType: "cpt",
    code: "80061",
  },
  {
    slug: "a1c-test",
    name: "A1C test",
    summary: "Blood test for average blood sugar over about three months.",
    category: "Lab tests",
    codeType: "cpt",
    code: "83036",
  },
  {
    slug: "thyroid-test",
    name: "Thyroid test (TSH)",
    summary: "Blood test for thyroid-stimulating hormone.",
    category: "Lab tests",
    codeType: "cpt",
    code: "84443",
  },
  {
    slug: "vitamin-d-test",
    name: "Vitamin D test",
    summary: "Blood test for 25-hydroxy vitamin D.",
    category: "Lab tests",
    codeType: "cpt",
    code: "82306",
  },
  {
    slug: "psa-test",
    name: "PSA test",
    summary: "Blood test for prostate-specific antigen (total PSA).",
    category: "Lab tests",
    codeType: "cpt",
    code: "84153",
  },

  // Heart and sleep tests
  {
    slug: "ekg",
    name: "EKG",
    summary: "12-lead electrocardiogram with the doctor's reading.",
    category: "Heart and sleep tests",
    codeType: "cpt",
    code: "93000",
  },
  {
    slug: "echocardiogram",
    name: "Echocardiogram",
    summary: "Complete ultrasound of the heart with Doppler.",
    category: "Heart and sleep tests",
    codeType: "cpt",
    code: "93306",
  },
  {
    slug: "sleep-study",
    name: "Sleep study",
    summary: "Overnight sleep study in a sleep lab, attended by a technician.",
    category: "Heart and sleep tests",
    codeType: "cpt",
    code: "95810",
  },

  // Scopes
  {
    slug: "colonoscopy",
    name: "Colonoscopy",
    summary: "Diagnostic colonoscopy without biopsy or polyp removal.",
    category: "Scopes",
    codeType: "cpt",
    code: "45378",
  },
  {
    slug: "upper-endoscopy",
    name: "Upper endoscopy (EGD)",
    summary:
      "Scope of the esophagus, stomach and upper small intestine, without biopsy.",
    category: "Scopes",
    codeType: "cpt",
    code: "43235",
  },

  // Outpatient surgery
  {
    slug: "cataract-surgery",
    name: "Cataract surgery",
    summary: "Standard cataract removal with lens implant, one eye.",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "66984",
  },
  {
    slug: "gallbladder-removal",
    name: "Gallbladder removal",
    summary: "Laparoscopic gallbladder removal (cholecystectomy).",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "47562",
  },
  {
    slug: "carpal-tunnel-surgery",
    name: "Carpal tunnel surgery",
    summary: "Open carpal tunnel release, one hand.",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "64721",
  },
  {
    slug: "inguinal-hernia-repair",
    name: "Inguinal hernia repair",
    summary: "Open repair of a first-time groin hernia, age 5 and up.",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "49505",
  },
  {
    slug: "vasectomy",
    name: "Vasectomy",
    summary: "Vasectomy, one or both sides.",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "55250",
  },
  {
    slug: "tonsillectomy",
    name: "Tonsillectomy",
    summary: "Tonsil removal, age 12 and up.",
    category: "Outpatient surgery",
    codeType: "cpt",
    code: "42826",
  },
];

export function findProcedure(slug: string): SeoProcedure | undefined {
  return SEO_PROCEDURES.find((p) => p.slug === slug);
}
