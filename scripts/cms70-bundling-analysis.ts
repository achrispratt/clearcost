/**
 * CMS 70 Bundling Analysis
 *
 * For each CMS 70 service, analyze:
 * 1. billing_class split (facility vs professional charges)
 * 2. Co-occurring codes at the same provider
 * 3. Medicare PFS professional component ratios
 *
 * Run with: npx tsx --env-file=.env.local scripts/cms70-bundling-analysis.ts
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supabaseUrl, supabaseKey);

  // Service categories for the CMS 70
  const categories: {
    name: string;
    bundleType: string;
    codes: { num: number; name: string; cpt: string[] }[];
  }[] = [
    {
      name: "Labs",
      bundleType: "single + phlebotomy",
      codes: [
        { num: 14, name: "Basic metabolic panel", cpt: ["80048"] },
        { num: 15, name: "Comprehensive blood panel", cpt: ["80053"] },
        { num: 16, name: "Obstetric blood panel", cpt: ["80055"] },
        { num: 17, name: "Lipid panel", cpt: ["80061"] },
        { num: 18, name: "Kidney function panel", cpt: ["80069"] },
        { num: 19, name: "Liver function panel", cpt: ["80076"] },
        { num: 22, name: "PSA test", cpt: ["84153"] },
        { num: 23, name: "TSH blood test", cpt: ["84443"] },
        { num: 24, name: "CBC with differential", cpt: ["85025"] },
        { num: 25, name: "CBC automated", cpt: ["85027"] },
        { num: 26, name: "Clotting time test", cpt: ["85610"] },
        { num: 27, name: "Coagulation assessment", cpt: ["85730"] },
      ],
    },
    {
      name: "Imaging",
      bundleType: "facility + professional reading",
      codes: [
        { num: 28, name: "CT head w/o contrast", cpt: ["70450"] },
        { num: 29, name: "MRI brain w/ contrast", cpt: ["70553"] },
        { num: 30, name: "X-ray lower back", cpt: ["72110"] },
        { num: 31, name: "MRI lower spine", cpt: ["72148"] },
        { num: 32, name: "CT pelvis w/ contrast", cpt: ["72193"] },
        { num: 33, name: "MRI knee", cpt: ["73721"] },
        { num: 34, name: "CT abdomen/pelvis w/ contrast", cpt: ["74177"] },
        { num: 35, name: "Abdominal ultrasound", cpt: ["76700"] },
        { num: 36, name: "OB ultrasound", cpt: ["76805"] },
        { num: 37, name: "Transvaginal ultrasound", cpt: ["76830"] },
        { num: 38, name: "Mammography single", cpt: ["77065"] },
        { num: 39, name: "Mammography both", cpt: ["77066"] },
        { num: 40, name: "Screening mammography", cpt: ["77067"] },
      ],
    },
  ];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CMS 70 BUNDLING ANALYSIS");
  console.log("═══════════════════════════════════════════════════════════\n");

  // =========================================================================
  // ANALYSIS 1: billing_class distribution for each CMS 70 code
  // =========================================================================
  console.log("─── billing_class SPLIT PER SERVICE ─────────────────────\n");

  const allCodes = [
    ...categories.flatMap((c) => c.codes.flatMap((s) => s.cpt)),
    // Add key surgery/procedure codes
    "19120",
    "29826",
    "29881",
    "42820",
    "43235",
    "43239",
    "45378",
    "45380",
    "45385",
    "47562",
    "49505",
    "55700",
    "59400",
    "59510",
    "66821",
    "66984",
    "93000",
    "93452",
    "95810",
    "97110",
    // Add phlebotomy
    "36415",
  ];

  console.log(
    "Code   | Service                    | Facility | Professional | Both  | Neither | Total"
  );
  console.log("─".repeat(95));

  for (const code of allCodes.slice(0, 40)) {
    // Count by billing_class
    const { count: facilityCount } = await sb
      .from("charges")
      .select("*", { count: "exact", head: true })
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "facility");

    const { count: profCount } = await sb
      .from("charges")
      .select("*", { count: "exact", head: true })
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "professional");

    const { count: bothCount } = await sb
      .from("charges")
      .select("*", { count: "exact", head: true })
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "both");

    const { count: totalCount } = await sb
      .from("charges")
      .select("*", { count: "exact", head: true })
      .or(`cpt.eq.${code},hcpcs.eq.${code}`);

    const neitherCount =
      (totalCount ?? 0) -
      (facilityCount ?? 0) -
      (profCount ?? 0) -
      (bothCount ?? 0);

    // Find name
    const svc = categories
      .flatMap((c) => c.codes)
      .find((s) => s.cpt.includes(code));
    const name = svc?.name ?? code;

    console.log(
      `${code.padEnd(7)}| ${name.substring(0, 26).padEnd(27)}| ${String(facilityCount ?? 0).padEnd(9)}| ${String(profCount ?? 0).padEnd(13)}| ${String(bothCount ?? 0).padEnd(6)}| ${String(neitherCount).padEnd(8)}| ${totalCount ?? 0}`
    );
  }

  // =========================================================================
  // ANALYSIS 2: Phlebotomy co-occurrence with lab codes
  // =========================================================================
  console.log("\n─── PHLEBOTOMY CO-OCCURRENCE WITH LABS ─────────────────\n");

  const labCodes = categories[0].codes;
  for (const lab of labCodes.slice(0, 6)) {
    // How many providers have BOTH the lab code AND 36415 (phlebotomy)?
    // We can't do a join via Supabase client, so just check overlap
    const { data: labProviders } = await sb
      .from("charges")
      .select("provider_id")
      .or(lab.cpt.map((c) => `cpt.eq.${c}`).join(","))
      .limit(10000);

    const labProviderIds = new Set(
      (labProviders ?? []).map((r) => r.provider_id)
    );

    const { data: phleboProviders } = await sb
      .from("charges")
      .select("provider_id")
      .eq("cpt", "36415")
      .limit(10000);

    const phleboProviderIds = new Set(
      (phleboProviders ?? []).map((r) => r.provider_id)
    );

    let overlap = 0;
    for (const id of labProviderIds) {
      if (phleboProviderIds.has(id)) overlap++;
    }

    const pct =
      labProviderIds.size > 0
        ? Math.round((overlap / labProviderIds.size) * 100)
        : 0;
    console.log(
      `  ${lab.name.padEnd(30)} ${overlap}/${labProviderIds.size} providers also have phlebotomy (${pct}%)`
    );
  }

  // =========================================================================
  // ANALYSIS 3: Medicare PFS professional component for imaging
  // =========================================================================
  console.log("\n─── MEDICARE PFS: FACILITY vs NON-FACILITY RATES ───────\n");

  const imagingCodes = categories[1].codes;
  console.log(
    "Code   | Service                    | Facility Rate | Non-Facility | Prof Component Est."
  );
  console.log("─".repeat(90));

  for (const img of imagingCodes) {
    const { data: pfs } = await sb
      .from("medicare_pfs")
      .select("facility_rate, non_facility_rate")
      .eq("code", img.cpt[0])
      .limit(1);

    if (pfs && pfs.length > 0) {
      const fr = pfs[0].facility_rate;
      const nfr = pfs[0].non_facility_rate;
      const profEst = nfr && fr ? nfr - fr : null;
      console.log(
        `${img.cpt[0].padEnd(7)}| ${img.name.substring(0, 26).padEnd(27)}| $${fr?.toFixed(2)?.padEnd(12) ?? "N/A".padEnd(12)}| $${nfr?.toFixed(2)?.padEnd(11) ?? "N/A".padEnd(11)}| ${profEst ? `~$${profEst.toFixed(2)}` : "N/A"}`
      );
    } else {
      console.log(
        `${img.cpt[0].padEnd(7)}| ${img.name.substring(0, 26).padEnd(27)}| N/A          | N/A         | N/A`
      );
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ANALYSIS COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
