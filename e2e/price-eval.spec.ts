import { expect, test, type APIRequestContext } from "@playwright/test";
import { findMetro } from "@/lib/seo/metros";
import { findPage, SEO_PAGE_INDEX } from "@/lib/seo/page-index";
import { findProcedure } from "@/lib/seo/procedures";
import { pricedCount } from "@/lib/results/summarize";
import { MIN_PRICED_HOSPITALS, summarizeCity } from "@/lib/seo/prices";
import type { ChargeResult } from "@/types";

/**
 * Consumer eval: common searches in big cities, run against the live search
 * API, must still answer the way the published city pages say they do
 * (lib/seo/page-index.json, rebuilt after every data load). Catches a load,
 * migration or deploy that empties a city, swings its prices, or lets an
 * impossible price through. The before/after check for loads lives in
 * scripts/data-check.ts; see docs/data-checks.md.
 *
 * Kept small for the search API's rate limit (100 a minute per visitor). The
 * whole suite still passes that from one runner, so a 429 waits out the
 * window (Retry-After) and asks again.
 */
const PROCEDURES = [
  "knee-mri",
  "head-ct",
  "chest-x-ray",
  "screening-mammogram",
  "complete-blood-count",
  "colonoscopy",
];
const METROS = [
  "new-york-ny",
  "los-angeles-ca",
  "chicago-il",
  "houston-tx",
  "phoenix-az",
  "philadelphia-pa",
  "seattle-wa",
  "atlanta-ga",
];

/** Live hospital count may sag this far below the index before failing. */
const MIN_HOSPITAL_SHARE = 0.5;
/** Live median may move this many times from the index before failing. */
const MAX_MEDIAN_FACTOR = 2;

async function search(request: APIRequestContext, data: object) {
  const response = await request.post("/api/search", { data });
  if (response.status() !== 429) return response;
  const retryAfter = Number(response.headers()["retry-after"] ?? 60);
  await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
  return request.post("/api/search", { data });
}

test.describe("price eval", () => {
  for (const slug of PROCEDURES) {
    test(`${slug} answers like its city pages`, async ({ request }) => {
      // API-only checks: one browser project is enough.
      test.skip(test.info().project.name !== "desktop", "runs on desktop only");
      test.setTimeout(120_000);
      const procedure = findProcedure(slug)!;
      const national = SEO_PAGE_INDEX.nationalMedians[slug];
      const problems: string[] = [];

      for (const metroSlug of METROS) {
        const page = findPage(slug, metroSlug);
        if (!page) continue; // not enough prices there to publish
        const metro = findMetro(metroSlug)!;

        const response = await search(request, {
          query: procedure.name,
          codes: [procedure.code],
          codeType: procedure.codeType,
          bodySite: procedure.bodySite,
          location: {
            lat: metro.lat,
            lng: metro.lng,
            radiusMiles: SEO_PAGE_INDEX.radiusMiles,
          },
        });
        if (!response.ok()) {
          problems.push(`${metroSlug}: search returned ${response.status()}`);
          continue;
        }
        const { results } = (await response.json()) as {
          results: ChargeResult[];
        };
        const summary = summarizeCity(procedure, results, national);
        const hospitals = pricedCount(summary);
        const minHospitals = Math.max(
          MIN_PRICED_HOSPITALS,
          Math.ceil(page.hospitals * MIN_HOSPITAL_SHARE)
        );

        if (summary.state !== "priced" || hospitals < minHospitals) {
          problems.push(
            `${metroSlug}: ${hospitals} priced hospitals (state ${summary.state}), page lists ${page.hospitals}`
          );
          continue;
        }
        const median = summary.median ?? 0;
        if (
          median > page.median * MAX_MEDIAN_FACTOR ||
          median < page.median / MAX_MEDIAN_FACTOR
        ) {
          problems.push(
            `${metroSlug}: median $${median}, page lists $${page.median}`
          );
        }
      }

      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
});
