/**
 * Check variance in professional/facility ratios across hospitals.
 * If the ratio is stable (low variance), small sample sizes are fine.
 * If it swings wildly, we need more data or a different approach.
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check the top imaging codes
  const codes = [
    { code: "73721", name: "MRI knee" },
    { code: "70450", name: "CT head" },
    { code: "72110", name: "X-ray lower back" },
    { code: "76700", name: "Abdominal ultrasound" },
    { code: "45378", name: "Colonoscopy" },
    { code: "77067", name: "Screening mammography" },
  ];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RATIO VARIANCE ANALYSIS");
  console.log("  How stable is the prof/facility ratio across hospitals?");
  console.log("═══════════════════════════════════════════════════════════\n");

  for (const { code, name } of codes) {
    const { data: facRows } = await sb
      .from("charges")
      .select("provider_id, cash_price")
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "facility")
      .gt("cash_price", 0)
      .limit(5000);

    const { data: profRows } = await sb
      .from("charges")
      .select("provider_id, cash_price")
      .or(`cpt.eq.${code},hcpcs.eq.${code}`)
      .ilike("billing_class", "professional")
      .gt("cash_price", 0)
      .limit(5000);

    if (!facRows || !profRows) continue;

    const facMap = new Map<string, number>();
    for (const r of facRows) {
      const existing = facMap.get(r.provider_id);
      if (!existing || r.cash_price < existing) {
        facMap.set(r.provider_id, r.cash_price);
      }
    }

    const profMap = new Map<string, number>();
    for (const r of profRows) {
      const existing = profMap.get(r.provider_id);
      if (!existing || r.cash_price < existing) {
        profMap.set(r.provider_id, r.cash_price);
      }
    }

    // Compute per-hospital ratio for providers with both
    const ratios: number[] = [];
    for (const [pid, facPrice] of facMap) {
      const profPrice = profMap.get(pid);
      if (profPrice && facPrice > 0) {
        const pctOfTotal = profPrice / (facPrice + profPrice);
        ratios.push(pctOfTotal);
      }
    }

    if (ratios.length < 3) {
      console.log(
        `${code} ${name}: only ${ratios.length} hospitals with both — skipping\n`
      );
      continue;
    }

    ratios.sort((a, b) => a - b);
    const mean = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    const variance =
      ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / ratios.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // coefficient of variation

    const p10 = ratios[Math.floor(ratios.length * 0.1)];
    const p25 = ratios[Math.floor(ratios.length * 0.25)];
    const p50 = ratios[Math.floor(ratios.length * 0.5)];
    const p75 = ratios[Math.floor(ratios.length * 0.75)];
    const p90 = ratios[Math.floor(ratios.length * 0.9)];

    console.log(`${code} ${name} (n=${ratios.length} hospitals)`);
    console.log(`  Mean:   ${(mean * 100).toFixed(1)}%`);
    console.log(`  StdDev: ${(stdDev * 100).toFixed(1)}%`);
    console.log(
      `  CV:     ${(cv * 100).toFixed(0)}% ${cv < 0.3 ? "✓ stable" : cv < 0.5 ? "~ moderate" : "⚠ high variance"}`
    );
    console.log(
      `  Range:  ${(ratios[0] * 100).toFixed(1)}% — ${(ratios[ratios.length - 1] * 100).toFixed(1)}%`
    );
    console.log(
      `  P10=${(p10 * 100).toFixed(0)}%  P25=${(p25 * 100).toFixed(0)}%  P50=${(p50 * 100).toFixed(0)}%  P75=${(p75 * 100).toFixed(0)}%  P90=${(p90 * 100).toFixed(0)}%`
    );

    // Statistical significance: for a proportion, the margin of error at 95% confidence
    // is ~1.96 * sqrt(p*(1-p)/n). Let's compute it.
    const marginOfError = 1.96 * Math.sqrt((mean * (1 - mean)) / ratios.length);
    console.log(
      `  95% CI: ${((mean - marginOfError) * 100).toFixed(1)}% — ${((mean + marginOfError) * 100).toFixed(1)}%`
    );
    console.log(
      `  Margin of error: ±${(marginOfError * 100).toFixed(1)} percentage points`
    );
    console.log();
  }
}

main().catch(console.error);
