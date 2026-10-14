import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChargeResult } from "@/types";

const mockData: {
  episode_definitions: unknown[];
  episode_components: unknown[];
  rpc: unknown[];
} = { episode_definitions: [], episode_components: [], rpc: [] };

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
    from: (table: "episode_definitions" | "episode_components") =>
      queryBuilder(table),
    rpc: async () => ({ data: mockData.rpc }),
  }),
}));

import {
  buildEpisodeEstimate,
  enrichWithEpisodeEstimates,
  episodeBillingClassFor,
  extractComponentPrice,
  isEstimateDisplayable,
  normalizeBillingClass,
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

describe("extractComponentPrice", () => {
  it("cash basis reads only the cash price", () => {
    const r = row("A", {
      cash_price: 250,
      avg_negotiated_rate: 90,
      min_price: 40,
      gross_charge: 900,
    });
    expect(extractComponentPrice(r, "cash")).toEqual({
      estimate: 250,
      min: 250,
      max: 250,
    });
  });

  it("negotiated basis reads the average and the negotiated range", () => {
    const r = row("A", {
      cash_price: 250,
      avg_negotiated_rate: 90,
      min_negotiated_rate: 60,
      max_negotiated_rate: 130,
    });
    expect(extractComponentPrice(r, "negotiated")).toEqual({
      estimate: 90,
      min: 60,
      max: 130,
    });
  });

  it("negotiated range falls back to the average when missing", () => {
    const r = row("A", { avg_negotiated_rate: 90 });
    expect(extractComponentPrice(r, "negotiated")).toEqual({
      estimate: 90,
      min: 90,
      max: 90,
    });
  });

  it("never falls back to gross or other bases", () => {
    const r = row("A", { gross_charge: 900, min_price: 40, max_price: 80 });
    expect(extractComponentPrice(r, "cash")).toBeUndefined();
    expect(extractComponentPrice(r, "negotiated")).toBeUndefined();
  });

  it("ignores zero and negative prices", () => {
    expect(extractComponentPrice(row("A", { cash_price: 0 }), "cash")).toBe(
      undefined
    );
    expect(
      extractComponentPrice(row("A", { avg_negotiated_rate: -5 }), "negotiated")
    ).toBeUndefined();
  });
});

describe("buildEpisodeEstimate", () => {
  it("sums cash prices and ignores other fields", () => {
    // 1000 + 200 + 300 = 1500, all 3 components priced
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
      priceBasis: "cash",
      billingClass: "facility",
    });
  });

  it("picks the basis that prices more of the episode", () => {
    // cash prices principal + A (2 of 4); negotiated prices all 4:
    // 800 + 150 + 100 + 50 = 1100
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A", "B", "C"],
      providerRows: [
        row("A", { cash_price: 200, avg_negotiated_rate: 150 }),
        row("B", { avg_negotiated_rate: 100 }),
        row("C", { avg_negotiated_rate: 50 }),
      ],
      principal: principal({ cashPrice: 1000, avgNegotiatedRate: 800 }),
    });

    expect(estimate?.priceBasis).toBe("negotiated");
    expect(estimate?.estimatedAllInMedian).toBe(1100);
    expect(estimate?.priceableCount).toBe(4);
  });

  it("prefers cash when both bases price the same number of components", () => {
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [row("A", { cash_price: 200, avg_negotiated_rate: 150 })],
      principal: principal({ cashPrice: 1000, avgNegotiatedRate: 800 }),
    });

    expect(estimate?.priceBasis).toBe("cash");
    expect(estimate?.estimatedAllInMedian).toBe(1200);
  });

  it("uses the negotiated basis when the principal has no cash price", () => {
    // Component cash price of 999 must not leak in: 800 + 150 = 950
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [row("A", { cash_price: 999, avg_negotiated_rate: 150 })],
      principal: principal({
        avgNegotiatedRate: 800,
        grossCharge: 4000,
      } as PrincipalCharge),
    });

    expect(estimate?.priceBasis).toBe("negotiated");
    expect(estimate?.estimatedAllInMedian).toBe(950);
  });

  it("sums the negotiated range on the negotiated basis", () => {
    // min: 600 + 100 = 700, max: 1000 + 200 = 1200
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [
        row("A", {
          avg_negotiated_rate: 150,
          min_negotiated_rate: 100,
          max_negotiated_rate: 200,
        }),
      ],
      principal: principal({
        avgNegotiatedRate: 800,
        minNegotiatedRate: 600,
        maxNegotiatedRate: 1000,
      }),
    });

    expect(estimate).toMatchObject({
      estimatedAllInMedian: 950,
      estimatedAllInMin: 700,
      estimatedAllInMax: 1200,
    });
  });

  it("returns no estimate when the principal only has a gross charge", () => {
    const estimate = buildEpisodeEstimate({
      episodeDef,
      componentCodes: ["A"],
      providerRows: [row("A", { cash_price: 200 })],
      principal: {
        billingClass: "facility",
        grossCharge: 4000,
      } as PrincipalCharge,
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
