import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupWithPricingPlan } from "@/lib/cpt/lookup";
import { getDisplayPrice } from "@/lib/format";
import type { PricingPlan } from "@/types";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  }),
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

const plan: PricingPlan = {
  mode: "encounter_first",
  queryType: "symptom",
  encounterType: "office",
  baseCodeGroups: [{ codeType: "cpt", codes: ["99213"] }],
  adders: [],
};
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    provider_id: "p1",
    provider_name: "Bellevue Hospital Center",
    provider_lat: 40.75,
    provider_lng: -74,
    distance_km: 1,
    cpt: "99213",
    setting: "outpatient",
    billing_class: "facility",
    cash_price: 0.01,
    gross_charge: 900,
    min_price: 0.01,
    max_price: 900,
    avg_negotiated_rate: 480,
    min_negotiated_rate: 300,
    max_negotiated_rate: 600,
    ...overrides,
  };
}
async function lookup(pricingPlan = plan) {
  return lookupWithPricingPlan({
    pricingPlan,
    lat: 40.75,
    lng: -74,
    radiusMiles: 25,
  });
}
beforeEach(() => {
  rpc.mockReset();
});

describe("encounter price construction", () => {
  it("does not turn a rejected placeholder or negotiated minimum into a cash price", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const [result] = await lookup();
    expect(result.cashPrice).toBeUndefined();
    expect(getDisplayPrice(result)).toMatchObject({
      amount: 480,
      type: "estimate",
    });
    expect(result.encounterEstimate).toMatchObject({
      basis: "insured",
      source: "facility",
      scope: "facility",
    });
  });

  it("does not call the median of published cash rows a published cash quote", async () => {
    rpc.mockResolvedValue({
      data: [row({ cash_price: 100 }), row({ id: "r2", cash_price: 200 })],
      error: null,
    });
    const [result] = await lookup();
    expect(result.cashPrice).toBeUndefined();
    expect(getDisplayPrice(result)).toMatchObject({
      amount: 150,
      type: "estimate",
    });
    expect(result.encounterEstimate?.basis).toBe("cash");
  });

  it("does not estimate from list-only or otherwise unpriced rows", async () => {
    rpc.mockResolvedValue({
      data: [row({ cash_price: null, avg_negotiated_rate: null })],
      error: null,
    });
    expect(await lookup()).toEqual([]);
  });
});

it("does not sum a doctor's fee into a hospital-only encounter estimate", async () => {
  rpc.mockImplementation(async (_name, params) => ({
    data: params.p_codes.includes("99213")
      ? [row({ cash_price: 500 })]
      : [
          row({
            id: "doctor",
            cpt: "70551",
            cash_price: 100,
            billing_class: "professional",
          }),
        ],
    error: null,
  }));
  const [result] = await lookup({
    ...plan,
    adders: [
      {
        id: "mri",
        label: "MRI",
        required: false,
        codeGroups: [{ codeType: "cpt", codes: ["70551"] }],
      },
    ],
  });
  expect(result.encounterEstimate?.amount).toBe(500);
  expect(result.optionalAdders?.[0].scope).toBe("professional");
  expect(result.estimatedTotalMedian).toBeUndefined();
});

it("does not total a borrowed base or borrowed adder as a hospital's own prices", async () => {
  rpc.mockImplementation(async (_name, params) => ({
    data: params.p_codes.includes("99213")
      ? [row({ cash_price: 500 })]
      : [
          row({
            id: "scan",
            provider_id: "p2",
            provider_name: "Scan Hospital",
            cpt: "70551",
            cash_price: 300,
          }),
        ],
    error: null,
  }));
  const results = await lookup({
    ...plan,
    adders: [
      {
        id: "mri",
        label: "MRI",
        required: false,
        codeGroups: [{ codeType: "cpt", codes: ["70551"] }],
      },
    ],
  });
  const borrowedBase = results.find((r) => r.provider.id === "p2")!;
  expect(borrowedBase.baseSource).toBe("local_fallback");
  expect(borrowedBase.estimatedTotalMedian).toBeUndefined();
  const borrowedAdder = results.find((r) => r.provider.id === "p1")!;
  expect(borrowedAdder.optionalAdders?.[0].source).toBe("local_fallback");
  expect(borrowedAdder.estimatedTotalMedian).toBeUndefined();
});

it("does not inherit side, body site or setting from an excluded template row", async () => {
  rpc.mockResolvedValue({
    data: [
      row({
        id: "inpatient",
        cash_price: 100,
        setting: "inpatient",
        laterality: "right",
        body_site: "knee",
      }),
      row({ id: "outpatient", cash_price: 500, setting: "outpatient" }),
    ],
    error: null,
  });
  const [result] = await lookup();
  expect(result.encounterEstimate?.amount).toBe(500);
  expect(result.setting).toBe("outpatient");
  expect(result.laterality).toBeUndefined();
  expect(result.bodySite).toBeUndefined();
});
