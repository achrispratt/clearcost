import { describe, it, expect } from "vitest";
import {
  isPublishable,
  MIN_PRICED_HOSPITALS,
  summarizeCity,
  withoutOutliers,
} from "@/lib/seo/prices";
import { findProcedure, SEO_PROCEDURES } from "@/lib/seo/procedures";
import { findMetro, SEO_METROS } from "@/lib/seo/metros";
import { resultsHref } from "@/lib/seo/links";
import { SEO_PAGE_INDEX } from "@/lib/seo/page-index";
import codeAllowlist from "@/lib/data/final-codes.json";
import type { ChargeResult } from "@/types";

let seq = 0;
function charge(cashPrice: number): ChargeResult {
  seq++;
  return {
    id: `c${seq}`,
    provider: { id: `p${seq}`, name: `Hospital ${seq}` },
    cpt: "73721",
    description: "MRI LOWER EXTREMITY JOINT W/O CONTRAST",
    cashPrice,
  };
}

const kneeMri = findProcedure("knee-mri")!;

describe("withoutOutliers", () => {
  it("drops prices more than 10x off the national typical price", () => {
    const kept = withoutOutliers(
      [charge(4), charge(160), charge(1600), charge(16000), charge(16001)],
      1600
    );
    expect(kept.map((r) => r.cashPrice)).toEqual([160, 1600, 16000]);
  });

  it("keeps lines without a price", () => {
    const unpriced: ChargeResult = { ...charge(1), cashPrice: undefined };
    expect(withoutOutliers([unpriced], 1600)).toHaveLength(1);
  });
});

describe("summarizeCity and isPublishable", () => {
  it("leaves a placeholder price out of the range", () => {
    const summary = summarizeCity(
      kneeMri,
      [charge(4), charge(900), charge(1500), charge(2100)],
      1600
    );
    expect(summary.low).toBe(900);
    expect(isPublishable(summary)).toBe(true);
  });

  it("needs enough priced hospitals to publish", () => {
    const few = Array.from({ length: MIN_PRICED_HOSPITALS - 1 }, () =>
      charge(1500)
    );
    expect(isPublishable(summarizeCity(kneeMri, few, 1600))).toBe(false);
  });
});

describe("SEO catalog", () => {
  it("only uses codes the import keeps", () => {
    const allowed = new Set(codeAllowlist as string[]);
    for (const p of SEO_PROCEDURES) expect(allowed.has(p.code)).toBe(true);
  });

  it("has unique slugs", () => {
    const slugs = [...SEO_PROCEDURES, ...SEO_METROS].map((x) => x.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain("in");
  });

  it("indexes only known procedures and cities", () => {
    for (const page of SEO_PAGE_INDEX.pages) {
      expect(findProcedure(page.procedure)).toBeDefined();
      expect(findMetro(page.metro)).toBeDefined();
      expect(page.hospitals).toBeGreaterThanOrEqual(MIN_PRICED_HOSPITALS);
    }
  });
});

describe("resultsHref", () => {
  it("opens results with the code chosen and the city located", () => {
    const url = new URL(
      resultsHref(kneeMri, findMetro("houston-tx")!),
      "https://x.test"
    );
    expect(url.pathname).toBe("/results");
    expect(url.searchParams.get("codes")).toBe("73721");
    expect(url.searchParams.get("codeType")).toBe("cpt");
    expect(url.searchParams.get("site")).toBe("knee");
    expect(url.searchParams.get("loc")).toBe("Houston, TX");
    expect(JSON.parse(url.searchParams.get("codeDescs")!)).toEqual({
      "73721": kneeMri.summary,
    });
  });
});
