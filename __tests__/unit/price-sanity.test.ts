import { describe, expect, it } from "vitest";
import { plausiblePrice } from "@/lib/cpt/price-sanity";

describe("plausiblePrice", () => {
  it("drops placeholder procedure prices", () => {
    expect(plausiblePrice(0.01, "45378", 198.55)).toBeUndefined();
    expect(plausiblePrice(0.75, "97110")).toBeUndefined();
    expect(plausiblePrice(0, "73721")).toBeUndefined();
    expect(plausiblePrice(null, "73721")).toBeUndefined();
  });

  it("drops a cash price far below the lowest insurer rate", () => {
    expect(plausiblePrice(5, "45378", 1200)).toBeUndefined();
  });

  it("keeps real prices", () => {
    expect(plausiblePrice(415.59, "73721", 300)).toBe(415.59);
    expect(plausiblePrice(7.92, "80053")).toBe(7.92);
    expect(plausiblePrice(1200, "235")).toBe(1200);
  });

  it("keeps per-unit drug and supply prices", () => {
    expect(plausiblePrice(0.05, "J3490", 4)).toBe(0.05);
    expect(plausiblePrice(0.35, "q9967")).toBe(0.35);
  });
});
