// Common shoppable CPT codes for MVP verification.
// This serves as the "verified lookup table" in our hybrid approach.

export const COMMON_CPT_CODES: Record<
  string,
  { description: string; category: string }
> = {
  // Radiology — MRI
  "70551": { description: "MRI brain without contrast", category: "Radiology" },
  "70553": {
    description: "MRI brain without contrast, then with contrast",
    category: "Radiology",
  },
  "73721": {
    description: "MRI joint of lower extremity without contrast",
    category: "Radiology",
  },
  "73723": {
    description:
      "MRI joint of lower extremity without contrast, then with contrast",
    category: "Radiology",
  },
  "73221": {
    description: "MRI joint of upper extremity without contrast",
    category: "Radiology",
  },
  "72148": {
    description: "MRI lumbar spine without contrast",
    category: "Radiology",
  },
  "72141": {
    description: "MRI cervical spine without contrast",
    category: "Radiology",
  },

  // Radiology — CT
  "74177": {
    description: "CT abdomen and pelvis with contrast",
    category: "Radiology",
  },
  "71260": { description: "CT chest with contrast", category: "Radiology" },

  // Radiology — X-Ray
  "71046": { description: "X-ray chest, 2 views", category: "Radiology" },
  "73030": {
    description: "X-ray shoulder, minimum 2 views",
    category: "Radiology",
  },
  "73560": { description: "X-ray knee, 1-2 views", category: "Radiology" },

  // Lab
  "80053": {
    description: "Comprehensive metabolic panel",
    category: "Lab",
  },
  "85025": {
    description: "Complete blood count (CBC) with differential",
    category: "Lab",
  },
  "80061": { description: "Lipid panel", category: "Lab" },
  "84443": {
    description: "TSH (thyroid stimulating hormone)",
    category: "Lab",
  },
  "81001": { description: "Urinalysis with microscopy", category: "Lab" },

  // Radiology — Ultrasound / Mammogram
  "76856": { description: "Ultrasound pelvic", category: "Radiology" },
  "77067": { description: "Screening mammogram", category: "Radiology" },

  // Office Visits
  "99213": {
    description: "Office visit, established patient, low complexity",
    category: "Office Visit",
  },
  "99214": {
    description: "Office visit, established patient, moderate complexity",
    category: "Office Visit",
  },
  "99203": {
    description: "Office visit, new patient, low complexity",
    category: "Office Visit",
  },
  "99204": {
    description: "Office visit, new patient, moderate complexity",
    category: "Office Visit",
  },

  // Allergy
  "95004": { description: "Allergy skin test", category: "Allergy" },

  // Cardiology
  "93306": { description: "Echocardiogram", category: "Cardiology" },

  // Sleep Medicine
  "95810": { description: "Sleep study", category: "Sleep Medicine" },

  // Physical Therapy
  "97161": {
    description: "Physical therapy evaluation",
    category: "Physical Therapy",
  },

  // Surgery
  "29881": {
    description: "Knee arthroscopy with meniscectomy",
    category: "Surgery",
  },
  "27447": { description: "Total knee replacement", category: "Surgery" },
  "27130": { description: "Total hip replacement", category: "Surgery" },
  "47562": {
    description: "Laparoscopic cholecystectomy (gallbladder removal)",
    category: "Surgery",
  },
  "58661": {
    description: "Laparoscopic removal of ovarian cyst",
    category: "Surgery",
  },

  // Gastroenterology
  "45378": {
    description: "Colonoscopy, diagnostic",
    category: "Gastroenterology",
  },
  "45380": {
    description: "Colonoscopy with biopsy",
    category: "Gastroenterology",
  },
  "45385": {
    description: "Colonoscopy with polyp removal",
    category: "Gastroenterology",
  },
  "43239": {
    description: "Upper endoscopy with biopsy",
    category: "Gastroenterology",
  },
};

export function verifyCPTCode(code: string): boolean {
  return code in COMMON_CPT_CODES;
}

export function getCPTDetails(code: string) {
  return COMMON_CPT_CODES[code] || null;
}
