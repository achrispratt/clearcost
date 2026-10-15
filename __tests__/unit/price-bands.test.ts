import { describe, it, expect, vi } from "vitest";
import {
  applyPriceBands,
  loadPriceReference,
  type PriceReference,
} from "@/lib/cpt/price-bands";
import type { ChargeResult } from "@/types";

vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));

function charge(overrides: Partial<ChargeResult>): ChargeResult {
  return {
    id: "c1",
    provider: { id: "p1", name: "Hospital" },
    cpt: "73721",
    description: "MRI LOWER EXTREMITY JOINT W/O CONTRAST",
    ...overrides,
  };
}

const reference: PriceReference = new Map([
  ["73721|false", 1600],
  ["73721|true", 120],
  ["85025|false", 30],
]);

describe("applyPriceBands", () => {
  it("clears a cash price more than 10x below the typical price", () => {
    const [r] = applyPriceBands(
      [charge({ cashPrice: 4.41, grossCharge: 3000 })],
      reference
    );
    expect(r.cashPrice).toBeUndefined();
    expect(r.grossCharge).toBe(3000);
  });

  it("clears an impossible high price and its insured range", () => {
    const [r] = applyPriceBands(
      [
        charge({
          cpt: "85025",
          cashPrice: 6089,
          avgNegotiatedRate: 5000,
          minNegotiatedRate: 4000,
          maxNegotiatedRate: 6000,
        }),
      ],
      reference
    );
    expect(r.cashPrice).toBeUndefined();
    expect(r.avgNegotiatedRate).toBeUndefined();
    expect(r.minNegotiatedRate).toBeUndefined();
    expect(r.maxNegotiatedRate).toBeUndefined();
  });

  it("keeps prices inside the band, at both edges", () => {
    const low = charge({ cashPrice: 160 });
    const high = charge({ cashPrice: 16000 });
    expect(applyPriceBands([low, high], reference)).toEqual([low, high]);
  });

  it("keeps a high list price", () => {
    const r = charge({ grossCharge: 40000 });
    expect(applyPriceBands([r], reference)[0]).toBe(r);
  });

  it("bands doctor's fees against the doctor's-fee typical price", () => {
    const [r] = applyPriceBands(
      [charge({ billingClass: "professional", cashPrice: 95 })],
      reference
    );
    expect(r.cashPrice).toBe(95);
  });

  it("leaves codes without a reference, stays and HCPCS Level II alone", () => {
    const rows = [
      charge({ cpt: "99999", cashPrice: 1 }),
      charge({ cpt: undefined, msDrg: "470", cashPrice: 2 }),
      charge({ cpt: undefined, hcpcs: "J1885", cashPrice: 2 }),
    ];
    expect(applyPriceBands(rows, reference)).toEqual(rows);
  });
});

describe("loadPriceReference", () => {
  function client(result: { data: unknown; error: unknown }) {
    const inFn = vi.fn().mockResolvedValue(result);
    const from = vi.fn(() => ({ select: () => ({ in: inFn }) }));
    return { supabase: { from } as never, from, inFn };
  }

  it("queries only bandable codes and keys rows by fee type", async () => {
    const { supabase, inFn } = client({
      data: [{ code: "73721", professional: false, typical_price: "1600" }],
      error: null,
    });
    const ref = await loadPriceReference(supabase, [
      charge({}),
      charge({ cpt: undefined, hcpcs: "J1885" }),
    ]);
    expect(inFn).toHaveBeenCalledWith("code", ["73721"]);
    expect(ref.get("73721|false")).toBe(1600);
  });

  it("returns an empty reference when the query fails", async () => {
    const { supabase } = client({ data: null, error: { message: "boom" } });
    const ref = await loadPriceReference(supabase, [charge({})]);
    expect(ref.size).toBe(0);
  });

  it("skips the query when nothing can be banded", async () => {
    const { supabase, from } = client({ data: [], error: null });
    await loadPriceReference(supabase, [
      charge({ cpt: undefined, msDrg: "1" }),
    ]);
    expect(from).not.toHaveBeenCalled();
  });
});
