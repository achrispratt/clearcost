/**
 * Common plain-English asks for the search box typeahead (#32). Picking one
 * only fills the query; guided search still works out the billing codes.
 */
export const PROCEDURE_SUGGESTIONS = [
  "Knee MRI",
  "Shoulder MRI",
  "Lower back MRI",
  "Brain MRI",
  "Hip MRI",
  "Ankle MRI",
  "CT scan of the abdomen",
  "Head CT",
  "Chest CT",
  "Chest X-ray",
  "Knee X-ray",
  "Foot X-ray",
  "Hand X-ray",
  "Mammogram",
  "Breast ultrasound",
  "Abdominal ultrasound",
  "Pregnancy ultrasound",
  "Pelvic ultrasound",
  "Colonoscopy",
  "Upper endoscopy",
  "Blood work",
  "Complete blood count",
  "Cholesterol test",
  "A1C diabetes test",
  "Thyroid test",
  "Urine test",
  "STD testing",
  "Pregnancy test",
  "EKG",
  "Echocardiogram",
  "Stress test",
  "Sleep study",
  "Bone density scan",
  "Physical therapy",
  "Allergy testing",
  "Hearing test",
  "Primary care visit",
  "Urgent care visit",
  "Specialist visit",
  "Annual physical",
  "Flu shot",
  "Knee replacement",
  "Hip replacement",
  "ACL repair",
  "Carpal tunnel surgery",
  "Cataract surgery",
  "Gallbladder removal",
  "Hernia repair",
  "Tonsillectomy",
  "Vasectomy",
  "C-section",
  "Vaginal delivery",
  "Kidney stone treatment",
  "Skin biopsy",
  "Mole removal",
  "Steroid injection",
];

const MAX_SUGGESTIONS = 6;

/** Matches every typed word against the start of a word in the suggestion. */
export function suggestProcedures(input: string): string[] {
  const words = input.toLowerCase().match(/[a-z0-9]+/g);
  if (!words || input.trim().length < 2) return [];
  return PROCEDURE_SUGGESTIONS.filter((s) => {
    const target = s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return words.every((w) => target.some((t) => t.startsWith(w)));
  }).slice(0, MAX_SUGGESTIONS);
}
