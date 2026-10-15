/**
 * Builds lib/seo/page-index.json: which procedure + city price pages have
 * enough real prices to publish (#24). The pages themselves render live data;
 * this index decides which ones exist, feeds the sitemap and the hub pages,
 * and keeps thin pages out of search engines.
 *
 * Re-run after every data import, then commit the JSON:
 *   npx tsx --env-file=.env.local scripts/build-seo-index.ts
 *
 * Read-only against the database.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEO_METROS } from "@/lib/seo/metros";
import { SEO_PROCEDURES } from "@/lib/seo/procedures";
import { summarizeAnswer } from "@/lib/results/summarize";
import {
  getCityResults,
  isPublishable,
  procedureCodes,
  SEO_RADIUS_MILES,
  summarizeCity,
} from "@/lib/seo/prices";
import type { ChargeResult } from "@/types";
import type { SeoPageIndex, SeoPageStats } from "@/lib/seo/page-index";

const CONCURRENCY = 6;
const OUT = resolve(__dirname, "../lib/seo/page-index.json");

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const supabase = createAdminClient();
  const jobs = SEO_PROCEDURES.flatMap((procedure) =>
    SEO_METROS.map((metro) => ({ procedure, metro }))
  );
  const total = jobs.length;
  const fetched: {
    procedure: (typeof jobs)[number]["procedure"];
    metro: (typeof jobs)[number]["metro"];
    results: ChargeResult[];
  }[] = [];
  let done = 0;
  let failed = 0;

  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;
      try {
        const results = await getCityResults(
          job.procedure,
          job.metro,
          supabase
        );
        fetched.push({ ...job, results });
      } catch (err) {
        failed++;
        console.error(`  ${job.procedure.slug} / ${job.metro.slug}:`, err);
      }
      if (++done % 100 === 0) console.log(`  ${done} of ${total} fetched`);
    }
  }

  console.log(`Fetching ${total} procedure + city pairs...`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failed > 0) {
    // A partial index would silently unpublish pages; refuse to write it.
    console.error(`${failed} lookups failed; index not written.`);
    process.exit(1);
  }

  // National typical price per procedure: the median of every hospital-side
  // price across all cities. Pages leave out prices far from it.
  const nationalMedians: Record<string, number> = {};
  for (const procedure of SEO_PROCEDURES) {
    const amounts = fetched
      .filter((f) => f.procedure.slug === procedure.slug)
      .flatMap((f) => {
        const { priced } = summarizeAnswer(
          f.results,
          procedureCodes(procedure)
        );
        const hospitalSide = priced.filter((e) => e.scope !== "professional");
        return (hospitalSide.length > 0 ? hospitalSide : priced).map(
          (e) => e.price.amount as number
        );
      });
    if (amounts.length > 0) {
      nationalMedians[procedure.slug] = Math.round(median(amounts));
    }
  }

  const pages: SeoPageStats[] = [];
  for (const { procedure, metro, results } of fetched) {
    const nationalMedian = nationalMedians[procedure.slug];
    if (nationalMedian == null) continue;
    const summary = summarizeCity(procedure, results, nationalMedian);
    if (!isPublishable(summary)) continue;
    pages.push({
      procedure: procedure.slug,
      metro: metro.slug,
      hospitals: summary.rangeCount!,
      low: Math.round(summary.low!),
      median: Math.round(summary.median!),
      high: Math.round(summary.high!),
    });
  }

  const order = (p: SeoPageStats) =>
    SEO_PROCEDURES.findIndex((x) => x.slug === p.procedure) * 1000 +
    SEO_METROS.findIndex((x) => x.slug === p.metro);
  pages.sort((a, b) => order(a) - order(b));

  const index: SeoPageIndex = {
    generatedAt: new Date().toISOString().slice(0, 10),
    radiusMiles: SEO_RADIUS_MILES,
    nationalMedians,
    pages,
  };
  writeFileSync(OUT, JSON.stringify(index, null, 2) + "\n");
  console.log(`Wrote ${pages.length} of ${total} pages to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
