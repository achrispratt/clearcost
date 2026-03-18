import { describe, it, expect } from "vitest";
import {
  formatPrice,
  getDisplayPrice,
  formatDisplayPrice,
  formatDistance,
  formatDate,
  formatBillingCode,
  formatApproxCount,
  displayName,
  type DisplayPrice,
} from "@/lib/format";
import type { ChargeResult } from "@/types";

// Helper to build a minimal ChargeResult for testing
function charge(overrides: Partial<ChargeResult> = {}): ChargeResult {
  return {
    id: "test-id",
    provider: { id: "p1", name: "Test Hospital" },
    ...overrides,
  };
}

describe("formatPrice", () => {
  it("returns N/A for undefined", () => {
    expect(formatPrice(undefined)).toBe("N/A");
  });

  it("returns N/A for null", () => {
    expect(formatPrice(null as unknown as undefined)).toBe("N/A");
  });

  it("formats a number with dollar sign and commas", () => {
    expect(formatPrice(1234)).toBe("$1,234");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });

  it("rounds decimals", () => {
    expect(formatPrice(1234.56)).toBe("$1,235");
  });
});

describe("getDisplayPrice", () => {
  it("returns cash price when available", () => {
    const result = getDisplayPrice(charge({ cashPrice: 500 }));
    expect(result.type).toBe("cash");
    expect(result.amount).toBe(500);
    expect(result.label).toBe("Cash price");
  });

  it("returns 'Base estimate' label for encounter_first mode", () => {
    const result = getDisplayPrice(
      charge({ cashPrice: 500, pricingMode: "encounter_first" })
    );
    expect(result.label).toBe("Base estimate");
  });

  it("uses baseLabel when provided", () => {
    const result = getDisplayPrice(
      charge({ cashPrice: 500, baseLabel: "Custom label" })
    );
    expect(result.label).toBe("Custom label");
  });

  it("falls back to negotiated rate when no cash price", () => {
    const result = getDisplayPrice(charge({ avgNegotiatedRate: 800 }));
    expect(result.type).toBe("insured");
    expect(result.amount).toBe(800);
  });

  it("falls back to gross charge as last resort", () => {
    const result = getDisplayPrice(charge({ grossCharge: 2000 }));
    expect(result.type).toBe("gross");
    expect(result.amount).toBe(2000);
  });

  it("returns unavailable when no prices exist", () => {
    const result = getDisplayPrice(charge());
    expect(result.type).toBe("unavailable");
    expect(result.amount).toBeUndefined();
  });
});

describe("formatDisplayPrice", () => {
  it("formats cash price without prefix", () => {
    const dp: DisplayPrice = { amount: 1234, label: "Cash", type: "cash" };
    expect(formatDisplayPrice(dp)).toBe("$1,234");
  });

  it("formats insured price with tilde prefix", () => {
    const dp: DisplayPrice = {
      amount: 800,
      label: "Insured",
      type: "insured",
    };
    expect(formatDisplayPrice(dp)).toBe("~$800");
  });

  it("returns N/A for undefined amount", () => {
    const dp: DisplayPrice = {
      amount: undefined,
      label: "",
      type: "unavailable",
    };
    expect(formatDisplayPrice(dp)).toBe("N/A");
  });
});

describe("formatDistance", () => {
  it("returns empty string for undefined", () => {
    expect(formatDistance(undefined)).toBe("");
  });

  it("formats miles to one decimal place", () => {
    expect(formatDistance(5.123)).toBe("5.1 mi");
  });

  it("formats zero", () => {
    expect(formatDistance(0)).toBe("0.0 mi");
  });
});

describe("formatDate", () => {
  it("returns empty string for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("formats a date string", () => {
    const result = formatDate("2026-01-15");
    expect(result).toMatch(/Jan\s+2026/);
  });
});

describe("formatBillingCode", () => {
  it("formats CPT code", () => {
    expect(formatBillingCode({ cpt: "73721" })).toBe("CPT 73721");
  });

  it("formats HCPCS code", () => {
    expect(formatBillingCode({ hcpcs: "J0123" })).toBe("HCPCS J0123");
  });

  it("formats MS-DRG code", () => {
    expect(formatBillingCode({ msDrg: "470" })).toBe("MS-DRG 470");
  });

  it("returns empty string when no code", () => {
    expect(formatBillingCode({})).toBe("");
  });

  it("prefers CPT over HCPCS", () => {
    expect(formatBillingCode({ cpt: "73721", hcpcs: "J0123" })).toBe(
      "CPT 73721"
    );
  });
});

describe("formatApproxCount", () => {
  it("formats millions", () => {
    expect(formatApproxCount(1_000_000)).toBe("1M+");
    expect(formatApproxCount(10_500_000)).toBe("10M+");
  });

  it("formats thousands with commas", () => {
    expect(formatApproxCount(5400)).toBe("5,400+");
  });
});

describe("displayName", () => {
  it("title-cases ALL CAPS names", () => {
    expect(displayName("ST DAVID'S MEDICAL CENTER")).toBe(
      "St David's Medical Center"
    );
  });

  it("leaves mixed-case names unchanged", () => {
    expect(displayName("Dell Seton Medical Center")).toBe(
      "Dell Seton Medical Center"
    );
  });

  it("lowercases prepositions", () => {
    expect(displayName("HOSPITAL AT THE UNIVERSITY OF TEXAS")).toBe(
      "Hospital at the University of Texas"
    );
  });

  it("keeps first character uppercase even if it's a preposition word", () => {
    expect(displayName("THE HEART HOSPITAL")).toBe("The Heart Hospital");
  });
});
