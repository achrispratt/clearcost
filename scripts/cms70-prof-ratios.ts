/**
 * Compute professional-to-facility fee ratios from our own charge data.
 * For imaging codes, hospitals that report both facility and professional billing_class
 * give us the real split at that hospital.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // CMS 70 imaging codes (the ones where professional component matters most)
  const imagingCodes = [
    { code: "70450", name: "CT head w/o contrast" },
    { code: "70553", name: "MRI brain w/ contrast" },
    { code: "72110", name: "X-ray lower back" },
    { code: "72148", name: "MRI lower spine" },
    { code: "72193", name: "CT pelvis w/ contrast" },
    { code: "73721", name: "MRI knee" },
    { code: "74177", name: "CT abdomen/pelvis" },
    { code: "76700", name: "Abdominal ultrasound" },
    { code: "76805", name: "OB ultrasound" },
    { code: "76830", name: "Transvaginal ultrasound" },
    { code: "77065", name: "Mammography single" },
    { code: "77066", name: "Mammography both" },
    { code: "77067", name: "Screening mammography" },
  ];

  // Key procedure/surgery codes
  const procedureCodes = [
    { code: "45378", name: "Colonoscopy diagnostic" },
    { code: "45380", name: "Colonoscopy biopsy" },
    { code: "43235", name: "Upper GI endoscopy" },
    { code: "47562", name: "Gallbladder removal" },
    { code: "49505", name: "Hernia repair" },
    { code: "66984", name: "Cataract w/ lens" },
    { code: "93452", name: "Left heart cath" },
    { code: "59400", name: "Vaginal delivery" },
    { code: "59510", name: "C-section" },
  ];

  const allCodes = [...imagingCodes, ...procedureCodes];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PROFESSIONAL/FACILITY FEE RATIO ANALYSIS");
  console.log("  (from hospitals that report both billing classes)");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(
    "Code".padEnd(8) +
      "Service".padEnd(28) +
      "Hospitals".padEnd(12) +
      "Med Fac$".padEnd(12) +
      "Med Prof$".padEnd(12) +
      "Prof/Fac".padEnd(10) +
      "Prof % of Total"
  );
  console.log("─".repeat(95));

  for (const { code, name } of allCodes) {
    // Get facility-class cash prices for this code
    const { data: facRows } = await sb
      .from("charges")
      .select("provider_id, cash_price")
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "facility")
      .gt("cash_price", 0)
      .limit(5000);

    // Get professional-class cash prices for this code
    const { data: profRows } = await sb
      .from("charges")
      .select("provider_id, cash_price")
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "professional")
      .gt("cash_price", 0)
      .limit(5000);

    if (
      !facRows ||
      !profRows ||
      facRows.length === 0 ||
      profRows.length === 0
    ) {
      console.log(
        code.padEnd(8) +
          name.substring(0, 26).padEnd(28) +
          "—".padEnd(12) +
          "—".padEnd(12) +
          "—".padEnd(12) +
          "—".padEnd(10) +
          "insufficient data"
      );
      continue;
    }

    // Find providers that have BOTH facility and professional charges
    const facByProvider = new Map<string, number[]>();
    for (const r of facRows) {
      const existing = facByProvider.get(r.provider_id) || [];
      existing.push(r.cash_price);
      facByProvider.set(r.provider_id, existing);
    }

    const profByProvider = new Map<string, number[]>();
    for (const r of profRows) {
      const existing = profByProvider.get(r.provider_id) || [];
      existing.push(r.cash_price);
      profByProvider.set(r.provider_id, existing);
    }

    // Providers with BOTH
    const bothProviders: { facPrice: number; profPrice: number }[] = [];
    for (const [pid, facPrices] of facByProvider) {
      const profPrices = profByProvider.get(pid);
      if (profPrices && profPrices.length > 0) {
        // Use median of each
        const medFac = median(facPrices);
        const medProf = median(profPrices);
        if (medFac > 0 && medProf > 0) {
          bothProviders.push({ facPrice: medFac, profPrice: medProf });
        }
      }
    }

    if (bothProviders.length === 0) {
      console.log(
        code.padEnd(8) +
          name.substring(0, 26).padEnd(28) +
          `${facRows.length}f/${profRows.length}p`.padEnd(12) +
          "—".padEnd(12) +
          "—".padEnd(12) +
          "—".padEnd(10) +
          "no overlap"
      );
      continue;
    }

    const facMedian = median(bothProviders.map((p) => p.facPrice));
    const profMedian = median(bothProviders.map((p) => p.profPrice));
    const ratio = profMedian / facMedian;
    const profPctOfTotal = (profMedian / (facMedian + profMedian)) * 100;

    console.log(
      code.padEnd(8) +
        name.substring(0, 26).padEnd(28) +
        `${bothProviders.length}`.padEnd(12) +
        `$${facMedian.toFixed(0)}`.padEnd(12) +
        `$${profMedian.toFixed(0)}`.padEnd(12) +
        `${ratio.toFixed(2)}`.padEnd(10) +
        `${profPctOfTotal.toFixed(1)}%`
    );
  }

  // Also check phlebotomy
  console.log("\n─── PHLEBOTOMY (36415) ─────────────────────────────────\n");
  const { data: phleboRows } = await sb
    .from("charges")
    .select("cash_price")
    .eq("cpt", "36415")
    .gt("cash_price", 0)
    .lt("cash_price", 200) // filter obvious outliers
    .limit(5000);

  if (phleboRows && phleboRows.length > 0) {
    const prices = phleboRows.map((r) => r.cash_price).sort((a, b) => a - b);
    console.log(`  Phlebotomy cash prices (n=${prices.length}):`);
    console.log(`  P10: $${percentile(prices, 10).toFixed(2)}`);
    console.log(`  P25: $${percentile(prices, 25).toFixed(2)}`);
    console.log(`  P50 (median): $${percentile(prices, 50).toFixed(2)}`);
    console.log(`  P75: $${percentile(prices, 75).toFixed(2)}`);
    console.log(`  P90: $${percentile(prices, 90).toFixed(2)}`);
  }

  // Sedation / anesthesia codes commonly bundled with endoscopy
  console.log("\n─── SEDATION/ANESTHESIA CODES ──────────────────────────\n");
  const sedationCodes = [
    { code: "99152", name: "Moderate sedation (same MD)" },
    { code: "99153", name: "Moderate sedation (add'l)" },
    { code: "99155", name: "Moderate sedation (diff MD)" },
    { code: "00810", name: "Anesthesia lower GI endoscopy" },
  ];

  for (const { code, name } of sedationCodes) {
    const { count } = await sb
      .from("charges")
      .select("*", { count: "exact", head: true })
      .or(`cpt.eq.${code},hcpcs.eq.${code}`);

    const { data: prices } = await sb
      .from("charges")
      .select("cash_price")
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .gt("cash_price", 0)
      .lt("cash_price", 10000)
      .limit(2000);

    const med =
      prices && prices.length > 0
        ? median(prices.map((p) => p.cash_price))
        : null;
    console.log(
      `  ${code} ${name.padEnd(35)} ${count ?? 0} charges, median cash: ${med ? `$${med.toFixed(0)}` : "N/A"}`
    );
  }
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], pct: number): number {
  const idx = Math.floor((pct / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

main().catch(console.error);
