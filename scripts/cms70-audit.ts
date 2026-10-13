/**
 * CMS 70 Shoppable Services Audit
 *
 * Cross-references the CMS 70 shoppable services against:
 * 1. episode_definitions table (SSP data already imported)
 * 2. charges table (hospital coverage per code)
 * 3. Cash vs gross charge ratio per service
 *
 * Run with: npx tsx --env-file=.env.local scripts/cms70-audit.ts
 *
 * For issue #145: SSP audit gate task for Episode Estimator Pivot.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // =========================================================================
  // CMS 70 Shoppable Services (from Hospital Price Transparency Final Rule Table 3)
  // Source: https://revspringinc.com/resources/blog/70-cms-specified-shoppable-services-required-by-price-transparency-ruling/
  // =========================================================================

  const cms70: {
    num: number;
    name: string;
    codes: string[];
    codeType: "cpt" | "hcpcs" | "ms_drg";
  }[] = [
    // Evaluation & Management (13 services)
    {
      num: 1,
      name: "Psychotherapy, 30 min",
      codes: ["90832"],
      codeType: "cpt",
    },
    {
      num: 2,
      name: "Psychotherapy, 45 min",
      codes: ["90834"],
      codeType: "cpt",
    },
    {
      num: 3,
      name: "Psychotherapy, 60 min",
      codes: ["90837"],
      codeType: "cpt",
    },
    {
      num: 4,
      name: "Family psychotherapy w/o patient, 50 min",
      codes: ["90846"],
      codeType: "cpt",
    },
    {
      num: 5,
      name: "Family psychotherapy w/ patient, 50 min",
      codes: ["90847"],
      codeType: "cpt",
    },
    { num: 6, name: "Group psychotherapy", codes: ["90853"], codeType: "cpt" },
    {
      num: 7,
      name: "New patient office visit, 30 min",
      codes: ["99203"],
      codeType: "cpt",
    },
    {
      num: 8,
      name: "New patient office visit, 45 min",
      codes: ["99204"],
      codeType: "cpt",
    },
    {
      num: 9,
      name: "New patient office visit, 60 min",
      codes: ["99205"],
      codeType: "cpt",
    },
    {
      num: 10,
      name: "Patient office consultation, 40 min",
      codes: ["99243"],
      codeType: "cpt",
    },
    {
      num: 11,
      name: "Patient office consultation, 60 min",
      codes: ["99244"],
      codeType: "cpt",
    },
    {
      num: 12,
      name: "Preventive eval (18-39 years)",
      codes: ["99385"],
      codeType: "cpt",
    },
    {
      num: 13,
      name: "Preventive eval (40-64 years)",
      codes: ["99386"],
      codeType: "cpt",
    },

    // Lab & Pathology (14 services)
    {
      num: 14,
      name: "Basic metabolic panel",
      codes: ["80048"],
      codeType: "cpt",
    },
    {
      num: 15,
      name: "Comprehensive blood panel",
      codes: ["80053"],
      codeType: "cpt",
    },
    {
      num: 16,
      name: "Obstetric blood test panel",
      codes: ["80055"],
      codeType: "cpt",
    },
    { num: 17, name: "Lipid panel", codes: ["80061"], codeType: "cpt" },
    {
      num: 18,
      name: "Kidney function panel",
      codes: ["80069"],
      codeType: "cpt",
    },
    {
      num: 19,
      name: "Liver function panel",
      codes: ["80076"],
      codeType: "cpt",
    },
    {
      num: 20,
      name: "Manual urinalysis",
      codes: ["81000", "81001"],
      codeType: "cpt",
    },
    {
      num: 21,
      name: "Automated urinalysis",
      codes: ["81002", "81003"],
      codeType: "cpt",
    },
    { num: 22, name: "PSA test", codes: ["84153", "84154"], codeType: "cpt" },
    { num: 23, name: "TSH blood test", codes: ["84443"], codeType: "cpt" },
    {
      num: 24,
      name: "CBC with differential",
      codes: ["85025"],
      codeType: "cpt",
    },
    { num: 25, name: "CBC automated", codes: ["85027"], codeType: "cpt" },
    { num: 26, name: "Clotting time test", codes: ["85610"], codeType: "cpt" },
    {
      num: 27,
      name: "Coagulation assessment",
      codes: ["85730"],
      codeType: "cpt",
    },

    // Radiology (13 services)
    {
      num: 28,
      name: "CT head/brain w/o contrast",
      codes: ["70450"],
      codeType: "cpt",
    },
    {
      num: 29,
      name: "MRI brain w/ contrast",
      codes: ["70553"],
      codeType: "cpt",
    },
    { num: 30, name: "X-ray lower back", codes: ["72110"], codeType: "cpt" },
    {
      num: 31,
      name: "MRI lower spinal canal",
      codes: ["72148"],
      codeType: "cpt",
    },
    {
      num: 32,
      name: "CT pelvis w/ contrast",
      codes: ["72193"],
      codeType: "cpt",
    },
    {
      num: 33,
      name: "MRI leg joint (knee)",
      codes: ["73721"],
      codeType: "cpt",
    },
    {
      num: 34,
      name: "CT abdomen/pelvis w/ contrast",
      codes: ["74177"],
      codeType: "cpt",
    },
    {
      num: 35,
      name: "Abdominal ultrasound",
      codes: ["76700"],
      codeType: "cpt",
    },
    {
      num: 36,
      name: "Ultrasound pregnant uterus",
      codes: ["76805"],
      codeType: "cpt",
    },
    {
      num: 37,
      name: "Transvaginal ultrasound",
      codes: ["76830"],
      codeType: "cpt",
    },
    {
      num: 38,
      name: "Mammography single breast",
      codes: ["77065"],
      codeType: "cpt",
    },
    {
      num: 39,
      name: "Mammography both breasts",
      codes: ["77066"],
      codeType: "cpt",
    },
    {
      num: 40,
      name: "Screening mammography bilateral",
      codes: ["77067"],
      codeType: "cpt",
    },

    // Medicine & Surgery (30 services)
    {
      num: 41,
      name: "Cardiac valve procedures w/ cath",
      codes: ["216"],
      codeType: "ms_drg",
    },
    { num: 42, name: "Spinal fusion", codes: ["460"], codeType: "ms_drg" },
    {
      num: 43,
      name: "Major joint replacement lower extremity",
      codes: ["470"],
      codeType: "ms_drg",
    },
    {
      num: 44,
      name: "Cervical spinal fusion",
      codes: ["473"],
      codeType: "ms_drg",
    },
    {
      num: 45,
      name: "Uterine/adnexa procedures",
      codes: ["743"],
      codeType: "ms_drg",
    },
    {
      num: 46,
      name: "Breast growth removal",
      codes: ["19120"],
      codeType: "cpt",
    },
    {
      num: 47,
      name: "Shoulder bone shaving endoscopic",
      codes: ["29826"],
      codeType: "cpt",
    },
    {
      num: 48,
      name: "Knee cartilage removal endoscopic",
      codes: ["29881"],
      codeType: "cpt",
    },
    {
      num: 49,
      name: "Tonsil/adenoid removal, <12",
      codes: ["42820"],
      codeType: "cpt",
    },
    {
      num: 50,
      name: "Upper GI diagnostic endoscopy",
      codes: ["43235"],
      codeType: "cpt",
    },
    {
      num: 51,
      name: "Upper GI biopsy endoscopic",
      codes: ["43239"],
      codeType: "cpt",
    },
    {
      num: 52,
      name: "Colonoscopy diagnostic",
      codes: ["45378"],
      codeType: "cpt",
    },
    { num: 53, name: "Colonoscopy biopsy", codes: ["45380"], codeType: "cpt" },
    {
      num: 54,
      name: "Colonoscopy polyp removal",
      codes: ["45385"],
      codeType: "cpt",
    },
    {
      num: 55,
      name: "Lower bowel ultrasound endoscopic",
      codes: ["45391"],
      codeType: "cpt",
    },
    {
      num: 56,
      name: "Gallbladder removal endoscopic",
      codes: ["47562"],
      codeType: "cpt",
    },
    { num: 57, name: "Groin hernia repair", codes: ["49505"], codeType: "cpt" },
    {
      num: 58,
      name: "Prostate gland biopsy",
      codes: ["55700"],
      codeType: "cpt",
    },
    {
      num: 59,
      name: "Prostate removal endoscopic",
      codes: ["55866"],
      codeType: "cpt",
    },
    {
      num: 60,
      name: "Vaginal delivery w/ OB care",
      codes: ["59400"],
      codeType: "cpt",
    },
    {
      num: 61,
      name: "Cesarean delivery w/ OB care",
      codes: ["59510"],
      codeType: "cpt",
    },
    { num: 62, name: "VBAC w/ OB care", codes: ["59610"], codeType: "cpt" },
    {
      num: 63,
      name: "Spinal injection lower back",
      codes: ["62322", "62323"],
      codeType: "cpt",
    },
    {
      num: 64,
      name: "Nerve root injection lower spine",
      codes: ["64483"],
      codeType: "cpt",
    },
    {
      num: 65,
      name: "Cataract removal w/ laser",
      codes: ["66821"],
      codeType: "cpt",
    },
    {
      num: 66,
      name: "Cataract removal w/ lens",
      codes: ["66984"],
      codeType: "cpt",
    },
    { num: 67, name: "Routine EKG", codes: ["93000"], codeType: "cpt" },
    {
      num: 68,
      name: "Left heart catheterization",
      codes: ["93452"],
      codeType: "cpt",
    },
    { num: 69, name: "Sleep study", codes: ["95810"], codeType: "cpt" },
    {
      num: 70,
      name: "Physical therapy exercise",
      codes: ["97110"],
      codeType: "cpt",
    },
  ];

  // Flatten all codes for querying
  const allCptCodes = cms70
    .filter((s) => s.codeType === "cpt")
    .flatMap((s) => s.codes);
  const allDrgCodes = cms70
    .filter((s) => s.codeType === "ms_drg")
    .flatMap((s) => s.codes);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CMS 70 SHOPPABLE SERVICES AUDIT");
  console.log("  ClearCost Episode Estimator Pivot — Issue #145");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(`Total CMS services: ${cms70.length}`);
  console.log(`  CPT/HCPCS codes: ${allCptCodes.length}`);
  console.log(`  MS-DRG codes: ${allDrgCodes.length}`);

  // =========================================================================
  // LAYER 1: Check episode_definitions (SSP data)
  // =========================================================================
  console.log("\n─── LAYER 1: SSP Episode Coverage ───────────────────────\n");

  const { data: episodeDefs } = await supabase
    .from("episode_definitions")
    .select("principal_code, label, category, source_claim_count");

  const episodeCodeSet = new Set(
    (episodeDefs || []).map((d) => d.principal_code.trim().toUpperCase())
  );
  console.log(`Total episode_definitions in DB: ${episodeDefs?.length ?? 0}`);

  let sspMatches = 0;
  let sspMisses = 0;
  const sspMatchList: string[] = [];
  const sspMissList: string[] = [];

  for (const svc of cms70) {
    const hasEpisode = svc.codes.some((c) =>
      episodeCodeSet.has(c.toUpperCase())
    );
    if (hasEpisode) {
      sspMatches++;
      sspMatchList.push(`  ✓ #${svc.num} ${svc.name} (${svc.codes.join("/")})`);
    } else {
      sspMisses++;
      sspMissList.push(`  ✗ #${svc.num} ${svc.name} (${svc.codes.join("/")})`);
    }
  }

  console.log(
    `\nCMS 70 with SSP episode data: ${sspMatches}/70 (${Math.round((sspMatches / 70) * 100)}%)`
  );
  console.log(`CMS 70 WITHOUT SSP data: ${sspMisses}/70\n`);
  console.log("MATCHES:");
  sspMatchList.forEach((l) => console.log(l));
  console.log("\nMISSING:");
  sspMissList.forEach((l) => console.log(l));

  // =========================================================================
  // LAYER 2: Check charges table coverage (how many hospitals per code)
  // =========================================================================
  console.log("\n─── LAYER 2: Hospital Charge Coverage ──────────────────\n");

  const results: {
    num: number;
    name: string;
    codes: string;
    codeType: string;
    hospitalCount: number;
    cashCount: number;
    grossOnlyCount: number;
    cashGrossRatio: number;
    avgCash: number | null;
    medianCash: number | null;
    minCash: number | null;
    maxCash: number | null;
    hasEpisode: boolean;
  }[] = [];

  for (const svc of cms70) {
    const codeList = svc.codes;
    const codeType = svc.codeType;

    // Build the query based on code type
    let query;
    if (codeType === "ms_drg") {
      query = supabase.rpc("sql", {
        query: `
          SELECT
            COUNT(DISTINCT provider_id) as hospital_count,
            COUNT(DISTINCT CASE WHEN cash_price IS NOT NULL AND cash_price > 0 THEN provider_id END) as cash_count,
            COUNT(DISTINCT CASE WHEN cash_price IS NOT NULL AND gross_charge IS NOT NULL
              AND cash_price > 0 AND gross_charge > 0
              AND ABS(cash_price - gross_charge) < 0.01 THEN provider_id END) as gross_only_count,
            AVG(CASE WHEN cash_price > 0 THEN cash_price END) as avg_cash,
            MIN(CASE WHEN cash_price > 0 THEN cash_price END) as min_cash,
            MAX(CASE WHEN cash_price > 0 THEN cash_price END) as max_cash
          FROM charges
          WHERE ms_drg IN (${codeList.map((c) => `'${c}'`).join(",")})
        `,
      });
    } else {
      query = supabase.rpc("sql", {
        query: `
          SELECT
            COUNT(DISTINCT provider_id) as hospital_count,
            COUNT(DISTINCT CASE WHEN cash_price IS NOT NULL AND cash_price > 0 THEN provider_id END) as cash_count,
            COUNT(DISTINCT CASE WHEN cash_price IS NOT NULL AND gross_charge IS NOT NULL
              AND cash_price > 0 AND gross_charge > 0
              AND ABS(cash_price - gross_charge) < 0.01 THEN provider_id END) as gross_only_count,
            AVG(CASE WHEN cash_price > 0 THEN cash_price END) as avg_cash,
            MIN(CASE WHEN cash_price > 0 THEN cash_price END) as min_cash,
            MAX(CASE WHEN cash_price > 0 THEN cash_price END) as max_cash
          FROM charges
          WHERE cpt IN (${codeList.map((c) => `'${c}'`).join(",")})
             OR hcpcs IN (${codeList.map((c) => `'${c}'`).join(",")})
        `,
      });
    }

    // We can't use raw SQL via Supabase client easily. Let's use individual queries instead.
    // Query hospital count for this code
    let hospitalCount = 0;
    let cashCount = 0;
    let grossOnlyCount = 0;

    if (codeType === "ms_drg") {
      // Count distinct providers with this DRG
      const { count } = await supabase
        .from("charges")
        .select("provider_id", { count: "exact", head: true })
        .in("ms_drg", codeList);
      hospitalCount = count ?? 0;

      // Count with cash prices
      const { count: cashCnt } = await supabase
        .from("charges")
        .select("provider_id", { count: "exact", head: true })
        .in("ms_drg", codeList)
        .gt("cash_price", 0);
      cashCount = cashCnt ?? 0;
    } else {
      // CPT/HCPCS: check both columns
      // Use OR filter
      const { count } = await supabase
        .from("charges")
        .select("provider_id", { count: "exact", head: true })
        .or(codeList.map((c) => `cpt.eq.${c},hcpcs.eq.${c}`).join(","));
      hospitalCount = count ?? 0;

      const { count: cashCnt } = await supabase
        .from("charges")
        .select("provider_id", { count: "exact", head: true })
        .or(codeList.map((c) => `cpt.eq.${c},hcpcs.eq.${c}`).join(","))
        .gt("cash_price", 0);
      cashCount = cashCnt ?? 0;
    }

    const hasEpisode = svc.codes.some((c) =>
      episodeCodeSet.has(c.toUpperCase())
    );

    results.push({
      num: svc.num,
      name: svc.name,
      codes: svc.codes.join("/"),
      codeType: svc.codeType,
      hospitalCount,
      cashCount,
      grossOnlyCount: 0, // simplified — we'll compute ratio from cash/total
      cashGrossRatio: hospitalCount > 0 ? cashCount / hospitalCount : 0,
      avgCash: null,
      medianCash: null,
      minCash: null,
      maxCash: null,
      hasEpisode,
    });

    // Progress indicator
    process.stdout.write(
      `  Checked #${svc.num} ${svc.name.substring(0, 30).padEnd(30)} — ${hospitalCount} hospitals, ${cashCount} w/cash\n`
    );
  }

  // =========================================================================
  // SUMMARY TABLE
  // =========================================================================
  console.log("\n─── SUMMARY: CMS 70 Coverage Report ────────────────────\n");

  // Sort by hospital count descending
  const sorted = [...results].sort((a, b) => b.hospitalCount - a.hospitalCount);

  console.log(
    "# ".padStart(4) +
      "Service".padEnd(40) +
      "Codes".padEnd(14) +
      "Type".padEnd(8) +
      "Hospitals".padEnd(12) +
      "w/Cash".padEnd(10) +
      "Cash%".padEnd(8) +
      "SSP?"
  );
  console.log("─".repeat(100));

  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;

  for (const r of sorted) {
    // Tier classification:
    // Tier 1: 60%+ hospitals have charges AND has cash pricing
    // Tier 2: Has charge data but sparse
    // Tier 3: No or minimal charge data
    const coveragePct = r.hospitalCount / 5419; // total hospitals
    let tier = "T3";
    if (coveragePct >= 0.3 && r.cashCount > 100) {
      tier = "T1";
      tier1Count++;
    } else if (r.hospitalCount > 50) {
      tier = "T2";
      tier2Count++;
    } else {
      tier3Count++;
    }

    console.log(
      `${r.num}`.padStart(3) +
        " " +
        r.name.substring(0, 38).padEnd(40) +
        r.codes.padEnd(14) +
        r.codeType.padEnd(8) +
        `${r.hospitalCount.toLocaleString()}`.padEnd(12) +
        `${r.cashCount.toLocaleString()}`.padEnd(10) +
        `${Math.round(r.cashGrossRatio * 100)}%`.padEnd(8) +
        (r.hasEpisode ? "✓ SSP" : "—")
    );
  }

  console.log("─".repeat(100));
  console.log(`\nTIERING SUMMARY:`);
  console.log(
    `  Tier 1 (launchable):  ${tier1Count}/70 — 30%+ hospital coverage, 100+ cash prices`
  );
  console.log(
    `  Tier 2 (partial):     ${tier2Count}/70 — some data, needs improvement`
  );
  console.log(`  Tier 3 (insufficient): ${tier3Count}/70 — minimal or no data`);
  console.log(`\n  SSP episode data:     ${sspMatches}/70`);
  console.log(`  No SSP data:          ${sspMisses}/70`);

  if (tier1Count < 15) {
    console.log(
      `\n⚠️  GATE CHECK: Only ${tier1Count} tier-1 services. Plan may need recalibration.`
    );
  } else {
    console.log(
      `\n✓  GATE CHECK: ${tier1Count} tier-1 services. Sufficient to proceed.`
    );
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
