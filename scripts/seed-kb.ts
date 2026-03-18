/**
 * Seeds the KB with common healthcare procedure searches.
 * Hits /api/clarify with turns=[] to trigger Claude assessment + KB write-back.
 * Run: npx tsx --env-file=.env.local scripts/seed-kb.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const QUERIES = [
  // Imaging — highest volume price-shopping category
  "MRI of the brain",
  "shoulder MRI",
  "back MRI",
  "hip MRI",
  "ankle MRI",
  "CT scan of the chest",
  "CT scan of the abdomen",
  "head CT scan",
  "chest X-ray",
  "ankle X-ray",
  "wrist X-ray",
  "abdominal ultrasound",
  "pelvic ultrasound",
  "mammogram",
  "breast MRI",
  "spine MRI",

  // Common procedures
  "colonoscopy screening",
  "upper endoscopy",
  "blood work",
  "comprehensive metabolic panel",
  "CBC blood test",
  "thyroid panel",
  "lipid panel",
  "urinalysis",
  "skin biopsy",
  "mole removal",
  "vasectomy",
  "hernia repair",
  "gallbladder removal",
  "appendectomy",
  "tonsillectomy",
  "cataract surgery",
  "LASIK",
  "carpal tunnel surgery",
  "trigger finger release",

  // Orthopedic — high cost, high search volume
  "ACL repair",
  "rotator cuff repair",
  "hip replacement",
  "shoulder replacement",
  "spinal fusion",
  "arthroscopic knee surgery",
  "cortisone injection",
  "epidural steroid injection",
  "physical therapy evaluation",

  // Cardiac
  "EKG",
  "stress test",
  "cardiac catheterization",
  "echocardiogram",

  // Women's health
  "pap smear",
  "prenatal visit",
  "IUD insertion",
  "C-section",
  "labor and delivery",

  // Emergency / visits
  "ER visit",
  "urgent care visit",
  "annual physical exam",
  "specialist consultation",

  // Other common
  "allergy testing",
  "sleep study",
  "hearing test",
  "bone density scan",
  "PET scan",
  "dialysis",
  "chemotherapy infusion",
  "radiation therapy",
  "wisdom teeth removal",
  "root canal",
  "dental crown",
];

async function seedQuery(query: string, index: number): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/api/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, turns: [] }),
    });

    if (!response.ok) {
      return `[${index + 1}] FAIL ${query}: HTTP ${response.status}`;
    }

    const data = await response.json();
    const type = data.confidence === "high" ? "resolution" : "question";
    const codes = data.codes?.length || 0;
    return `[${index + 1}] OK   ${query} → ${type} (${codes} codes)`;
  } catch (err) {
    return `[${index + 1}] ERR  ${query}: ${err}`;
  }
}

async function main() {
  console.log(
    `Seeding KB with ${QUERIES.length} queries via ${BASE_URL}/api/clarify`
  );
  console.log("---");

  // Process in batches of 3 to avoid overwhelming the API / Claude rate limits
  const BATCH_SIZE = 3;
  let resolved = 0;
  let questions = 0;
  let failed = 0;

  for (let i = 0; i < QUERIES.length; i += BATCH_SIZE) {
    const batch = QUERIES.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((query, j) => seedQuery(query, i + j))
    );

    for (const result of results) {
      console.log(result);
      if (result.includes("→ resolution")) resolved++;
      else if (result.includes("→ question")) questions++;
      else failed++;
    }

    // Brief pause between batches to be nice to Claude API
    if (i + BATCH_SIZE < QUERIES.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("---");
  console.log(
    `Done: ${resolved} resolved directly, ${questions} need clarification, ${failed} failed`
  );
  console.log(`Total KB entries seeded: ${resolved + questions}`);
}

main();
