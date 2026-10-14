import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChargeResult } from "@/types";

const mockData: {
  episode_definitions: unknown[];
  episode_components: unknown[];
  provider_cash_ratios: unknown[];
  rpc: unknown[];
} = {
  episode_definitions: [],
  episode_components: [],
  provider_cash_ratios: [],
  rpc: [],
};

// Chainable query builder: every filter returns itself, awaiting resolves the
// table's canned rows.
function queryBuilder(table: keyof typeof mockData) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "in"]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: { data: unknown[] }) => unknown) =>
    resolve({ data: mockData[table] });
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: Exclude<keyof typeof mockData, "rpc">) => queryBuilder(table),
    rpc: async () => ({ data: mockData.rpc }),
  }),
}));

import {
  buildEpisodeEstimate,
  enrichWithEpisodeEstimates,
  episodeBillingClassFor,
  groupCashRatios,
  isEstimateDisplayable,
  NATIONAL_CASH_RATIOS,
  normalizeBillingClass,
  priceLine,
  type CashRatio,
  type ComponentChargeRow,
  type PrincipalCharge,
} from "@/lib/cpt/episode";

const episodeDef = {
  id: "ep-1",
  principal_code: "73721",
  label: "Knee MRI",
  category: null,
};

function row(
  code: string,
  overrides: Partial<ComponentChargeRow> = {}
): ComponentChargeRow {
  return {
    provider_id: "p1",
    component_code: code,
    component_code_type: "cpt",
    component_tier: "required",
    component_association: 0.9,
    billing_class: "facility",
    cash_price: null,
    gross_charge: null,
    avg_negotiated_rate: null,
    min_negotiated_rate: null,
    max_negotiated_rate: null,
    min_price: null,
    max_price: null,
    ...overrides,
  };
}

function principal(overrides: Partial<PrincipalCharge> = {}): PrincipalCharge {
  return { billingClass: "facility", ...overrides };
}

describe("normalizeBillingClass", () => {
  it("collapses the spellings found in hospital files", () => {
    expect(normalizeBillingClass("facility")).toBe("facility");
    expect(normalizeBillingClass("Facility")).toBe("facility");
    expect(normalizeBillingClass(" FACILITY ")).toBe("facility");
    expect(normalizeBillingClass("faciltiy")).toBe("facility");
    expect(normalizeBillingClass("HOSPITAL")).toBe("facility");
    expect(normalizeBillingClass("Professional")).toBe("professional");
    expect(normalizeBillingClass("Both")).toBe("both");
    expect(normalizeBillingClass(null)).toBe("unspecified");
    expect(normalizeBillingClass("")).toBe("unspecified");
    expect(normalizeBillingClass("ambulance")).toBe("other");
  });

  it("builds unlabeled principals as facility and refuses bundled ones", () => {
    expect(episodeBillingClassFor(undefined)).toBe("facility");
    expect(episodeBillingClassFor("PROFESSIONAL")).toBe("professional");
    expect(episodeBillingClassFor("Both")).toBeUndefined();
    expect(episodeBillingClassFor("ambulance")).toBeUndefined();
  });
});

// A tight hospital ratio: medium confidence.
const tightRatio: CashRatio = { pairCount: 20, q1: 0.8, median: 1.0, q3: 1.2 };

describe("priceLine", () => {
  it("uses the cash price when there is one, at high confidence", () => {
    const line = priceLine(
      [
        row("A", {
          cash_price: 100,
          avg_negotiated_rate: 50,
          gross_charge: 900,
        }),
        row("A", { cash_price: 300 }),
        row("A", { cash_price: 200 }),
      ],
      { insured: tightRatio }
    );
    expect(line).toEqual({
      source: "cash",
      confidence: "high",
      estimate: 200,
      min: 100,
      max: 300,
    });
  });

  it("converts the insured rate with the hospital's own ratio", () => {
    // 100 x 1.0 = 100; range 80 x 0.8 = 64 to 130 x 1.2 = 156
    const line = priceLine(
      [
        row("A", {
          avg_negotiated_rate: 100,
          min_negotiated_rate: 80,
          max_negotiated_rate: 130,
        }),
      ],
      { insured: tightRatio }
    );
    expect(line).toMatchObject({
      source: "insured_converted",
      confidence: "medium",
      ratioScope: "hospital",
      estimate: 100,
      min: 64,
      max: 156,
    });
  });

  it("falls back to the national ratio at low confidence", () => {
    // Too few pairs to trust the hospital: 100 x 1.13, 100 x 0.75, 100 x 1.91
    const line = priceLine([row("A", { avg_negotiated_rate: 100 })], {
      insured: { ...tightRatio, pairCount: 2 },
    });
    const n = NATIONAL_CASH_RATIOS.insured;
    expect(line).toMatchObject({
      source: "insured_converted",
      confidence: "low",
      ratioScope: "national",
    });
    expect(line?.estimate).toBeCloseTo(100 * n.median);
    expect(line?.min).toBeCloseTo(100 * n.q1);
    expect(line?.max).toBeCloseTo(100 * n.q3);
  });

  it("marks a noisy hospital ratio low confidence", () => {
    // q3 / q1 = 4, wider than the 2.5 limit
    const line = priceLine([row("A", { avg_negotiated_rate: 100 })], {
      insured: { pairCount: 50, q1: 0.5, median: 1.0, q3: 2.0 },
    });
    expect(line).toMatchObject({ confidence: "low", ratioScope: "hospital" });
  });

  it("prefers the tighter of two equally confident conversions", () => {
    // gross ratio spread 1.18 beats insured spread 2.0: 500 x 0.6 = 300
    const line = priceLine(
      [row("A", { avg_negotiated_rate: 100, gross_charge: 500 })],
      {
        insured: { pairCount: 10, q1: 0.6, median: 0.9, q3: 1.2 },
        gross: { pairCount: 10, q1: 0.55, median: 0.6, q3: 0.65 },
      }
    );
    expect(line).toMatchObject({ source: "gross_converted", estimate: 300 });
  });

  it("prefers a hospital ratio over a national one", () => {
    // insured has a hospital ratio, gross only national: insured wins
    const line = priceLine(
      [row("A", { avg_negotiated_rate: 100, gross_charge: 500 })],
      { insured: { pairCount: 50, q1: 0.5, median: 1.0, q3: 2.0 } }
    );
    expect(line).toMatchObject({
      source: "insured_converted",
      ratioScope: "hospital",
    });
  });

  it("returns nothing when no row has any price", () => {
    expect(priceLine([row("A", { cash_price: 0 })], {})).toBeUndefined();
    expect(priceLine([], {})).toBeUndefined();
  });
});

describe("groupCashRatios", () => {
  it("groups ratio rows by provider and type", () => {
    const grouped = groupCashRatios([
      {
        provider_id: "p1",
        ratio_type: "insured",
        pair_count: 9,
        q1: 0.8,
        median: 1,
        q3: 1.2,
      },
      {
        provider_id: "p1",
        ratio_type: "gross",
        pair_count: 7,
        q1: 0.4,
        median: 0.5,
        q3: 0.6,
      },
    ]);
    expect(grouped.get("p1")).toEqual({
      insured: { pairCount: 9, q1: 0.8, median: 1, q3: 1.2 },
      gross: { pairCount: 7, q1: 0.4, median: 0.5, q3: 0.6 },
    });
  });
});

describe("buildEpisodeEstimate", () => {
  it("sums cash prices at high confidence when everything has cash", () => {
    // 1000 + 200 + 300 = 1500
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A", "B"],
      providerRows: [
        row("A", { cash_price: 200, gross_charge: 5000 }),
        row("B", { cash_price: 300, avg_negotiated_rate: 50 }),
      ],
      principal: principal({ cashPrice: 1000, avgNegotiatedRate: 700 }),
    });

    expect(estimate).toMatchObject({
      estimatedAllInMedian: 1500,
      estimatedAllInMin: 1500,
      estimatedAllInMax: 1500,
      componentCount: 3,
      priceableCount: 3,
      coverageRatio: 1,
      cashCoverageRatio: 1,
      confidence: "high",
      billingClass: "facility",
      missingCodes: [],
    });
    expect(estimate?.lines.map((l) => l.code)).toEqual(["73721", "A", "B"]);
    expect(estimate?.lines[0].isPrincipal).toBe(true);
  });

  it("fills cash gaps with converted insured rates and lists what is missing", () => {
    // principal 1000 cash, A 200 cash, B 100 insured x 1.0, C missing
    // total 1300; min 1000 + 200 + 80; max 1000 + 200 + 120
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A", "B", "C"],
      providerRows: [
        row("A", { cash_price: 200 }),
        row("B", { avg_negotiated_rate: 100 }),
      ],
      principal: principal({ cashPrice: 1000 }),
      ratios: { insured: tightRatio },
    });

    expect(estimate).toMatchObject({
      estimatedAllInMedian: 1300,
      estimatedAllInMin: 1280,
      estimatedAllInMax: 1320,
      priceableCount: 3,
      componentCount: 4,
      coverageRatio: 0.75,
      cashCoverageRatio: 0.5,
      confidence: "medium",
      missingCodes: ["C"],
    });
    expect(estimate?.lines.find((l) => l.code === "B")?.source).toBe(
      "insured_converted"
    );
  });

  it("converts the principal when it has no cash price", () => {
    // national: 800 x 1.13 = 904, plus A 200 cash = 1104
    // the low-confidence line is most of the dollars, so the estimate is low
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [row("A", { cash_price: 200 })],
      principal: principal({ avgNegotiatedRate: 800 }),
    });

    expect(estimate?.estimatedAllInMedian).toBeCloseTo(
      800 * NATIONAL_CASH_RATIOS.insured.median + 200
    );
    expect(estimate?.lines[0]).toMatchObject({
      source: "insured_converted",
      confidence: "low",
    });
    expect(estimate?.confidence).toBe("low");
  });

  it("returns no estimate when the principal has no price at all", () => {
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [row("A", { cash_price: 200 })],
      principal: principal(),
    });
    expect(estimate).toBeUndefined();
  });

  it("collapses several rows for one code to their median and range", () => {
    // A: median(100, 300, 200) = 200, min 100, max 300
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [
        row("A", { cash_price: 100 }),
        row("A", { cash_price: 300 }),
        row("A", { cash_price: 200 }),
      ],
      principal: principal({ cashPrice: 1000 }),
    });

    expect(estimate).toMatchObject({
      estimatedAllInMedian: 1200,
      estimatedAllInMin: 1100,
      estimatedAllInMax: 1300,
    });
  });

  describe("billing class", () => {
    it("keeps professional fees out of a facility estimate", () => {
      // A: facility 200 (professional 80 ignored)
      // B: only a professional row, so unpriced
      // C: unlabeled 40, used because there is no facility row
      // 1000 + 200 + 40 = 1240, 3 of 4 priced
      const estimate = buildEpisodeEstimate({
        episodeDef,
        componentCodes: ["A", "B", "C"],
        providerRows: [
          row("A", { cash_price: 200 }),
          row("A", { cash_price: 80, billing_class: "Professional" }),
          row("B", { cash_price: 90, billing_class: "professional" }),
          row("C", { cash_price: 40, billing_class: null }),
        ],
        principal: principal({ cashPrice: 1000 }),
      });

      expect(estimate).toMatchObject({
        estimatedAllInMedian: 1240,
        priceableCount: 3,
        componentCount: 4,
        coverageRatio: 0.75,
        billingClass: "facility",
      });
    });

    it("prefers labeled facility rows over unlabeled ones", () => {
      const estimate = buildEpisodeEstimate({
        episodeDef,
        componentCodes: ["A"],
        providerRows: [
          row("A", { cash_price: 200, billing_class: "FACILITY" }),
          row("A", { cash_price: 500, billing_class: null }),
        ],
        principal: principal({ cashPrice: 1000 }),
      });

      expect(estimate?.estimatedAllInMedian).toBe(1200);
    });

    it("builds a professional estimate from professional rows only", () => {
      // 150 + 80 = 230; facility 200 and unlabeled 40 ignored
      const estimate = buildEpisodeEstimate({
        episodeDef,
        componentCodes: ["A", "C"],
        providerRows: [
          row("A", { cash_price: 200 }),
          row("A", { cash_price: 80, billing_class: "professional" }),
          row("C", { cash_price: 40, billing_class: null }),
        ],
        principal: principal({ billingClass: "Professional", cashPrice: 150 }),
      });

      expect(estimate).toMatchObject({
        estimatedAllInMedian: 230,
        priceableCount: 2,
        billingClass: "professional",
      });
    });

    it("refuses principals billed as Both", () => {
      const estimate = buildEpisodeEstimate({
        episodeDef,
        componentCodes: ["A"],
        providerRows: [row("A", { cash_price: 200 })],
        principal: principal({ billingClass: "Both", cashPrice: 1000 }),
      });
      expect(estimate).toBeUndefined();
    });
  });

  it("measures coverage against the full component list", () => {
    // Only A has data: 2 of 5 priced, below the display threshold
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A", "B", "C", "D"],
      providerRows: [row("A", { cash_price: 200 })],
      principal: principal({ cashPrice: 1000 }),
    });

    expect(estimate).toMatchObject({
      priceableCount: 2,
      componentCount: 5,
      coverageRatio: 0.4,
    });
    expect(isEstimateDisplayable(estimate!)).toBe(false);
  });

  it("does not show an estimate that is only the base price", () => {
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [],
      principal: principal({ cashPrice: 1000 }),
    });

    expect(estimate).toMatchObject({ priceableCount: 1, coverageRatio: 0.5 });
    expect(isEstimateDisplayable(estimate!)).toBe(false);
  });
});

describe("enrichWithEpisodeEstimates", () => {
  function result(providerId: string, cashPrice: number): ChargeResult {
    return {
      id: `charge-${providerId}`,
      provider: {
        id: providerId,
        name: providerId,
      } as ChargeResult["provider"],
      cpt: "73721",
      billingClass: "facility",
      cashPrice,
    };
  }

  beforeEach(() => {
    mockData.episode_definitions = [episodeDef];
    // SSPs list the principal as their own component
    mockData.episode_components = [
      { code: "73721" },
      { code: "A" },
      { code: "B" },
    ];
    mockData.rpc = [
      row("73721", { provider_id: "p1", cash_price: 1000 }),
      row("A", { provider_id: "p1", cash_price: 200 }),
      row("B", { provider_id: "p1", cash_price: 300 }),
      // p2 only has A; its estimate must not borrow p1's B
      row("73721", { provider_id: "p2", cash_price: 900 }),
      row("A", { provider_id: "p2", cash_price: 100 }),
    ];
  });

  it("does not count the principal procedure twice", async () => {
    const [p1] = await enrichWithEpisodeEstimates([result("p1", 1000)]);
    // 1000 + 200 + 300, not 2000 + 200 + 300
    expect(p1.episodeEstimate?.estimatedAllInMedian).toBe(1500);
    expect(p1.episodeEstimate?.componentCount).toBe(3);
  });

  it("gives a hospital the same estimate whoever it is searched with", async () => {
    const [aloneP2] = await enrichWithEpisodeEstimates([result("p2", 900)]);
    const [, withP1] = await enrichWithEpisodeEstimates([
      result("p1", 1000),
      result("p2", 900),
    ]);

    // 900 + 100, 2 of 3 priced; B is never backfilled from p1
    expect(aloneP2.episodeEstimate?.estimatedAllInMedian).toBe(1000);
    expect(withP1.episodeEstimate).toEqual(aloneP2.episodeEstimate);
  });
});
