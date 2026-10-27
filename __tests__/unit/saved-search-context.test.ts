import { describe, expect, it } from "vitest";
import {
  parseSearchContext,
  savedSearchHref,
} from "@/lib/saved-search-context";
import type { SavedSearch } from "@/types";

const context = {
  version: 1,
  codes: [
    {
      code: "73721",
      codeType: "cpt",
      description: "Knee MRI",
      category: "Imaging",
    },
    {
      code: "470",
      codeType: "ms_drg",
      description: "Stay",
      category: "Surgery",
    },
  ],
  interpretation: "Right knee without contrast",
  laterality: "right",
  bodySite: "knee",
  pricingPlan: {
    mode: "procedure_first",
    queryType: "procedure",
    baseCodeGroups: [{ codeType: "cpt", codes: ["73721"] }],
    adders: [],
  },
};
const saved: SavedSearch = {
  id: "s1",
  user_id: "u1",
  query: "my knee",
  location: "NYC",
  cpt_codes: ["73721"],
  lat: 40.75,
  lng: -74,
  created_at: "2026-10-25",
};

describe("saved resolved search", () => {
  it("restores code types, descriptions, interpretation, plan, side and site", () => {
    const parsed = parseSearchContext(context)!;
    const url = new URL(
      savedSearchHref({ ...saved, search_context: parsed }),
      "https://example.test"
    );
    expect(url.pathname).toBe("/results");
    expect(JSON.parse(url.searchParams.get("codeGroups")!)).toEqual([
      { codeType: "cpt", codes: ["73721"] },
      { codeType: "ms_drg", codes: ["470"] },
    ]);
    expect(url.searchParams.get("side")).toBe("right");
    expect(url.searchParams.get("site")).toBe("knee");
    expect(url.searchParams.get("interp")).toBe("Right knee without contrast");
    expect(JSON.parse(url.searchParams.get("plan")!)).toEqual(
      context.pricingPlan
    );
    expect(JSON.parse(url.searchParams.get("codeDescs")!)["73721"]).toBe(
      "Knee MRI"
    );
  });
  it("uses stored codes for legacy searches instead of reinterpreting the query", () => {
    const url = new URL(savedSearchHref(saved), "https://example.test");
    expect(url.searchParams.get("codes")).toBe("73721");
    expect(url.searchParams.get("codeType")).toBe("cpt");
  });
  it.each([
    { ...context, version: 2 },
    { ...context, laterality: "backwards" },
    { ...context, codes: [{ code: "73721", codeType: "invalid" }] },
    { ...context, interpretation: "x".repeat(2001) },
    { ...context, codes: Array(51).fill(context.codes[0]) },
    {
      ...context,
      pricingPlan: {
        ...context.pricingPlan,
        adders: Array(11).fill({
          id: "mri",
          label: "MRI",
          codeGroups: [{ codeType: "cpt", codes: ["73721"] }],
        }),
      },
    },
  ])("rejects malformed or oversized context", (value) => {
    expect(parseSearchContext(value)).toBeNull();
  });
});

it("reopens a plan-only context with direct codes instead of invoking AI", () => {
  const parsed = parseSearchContext({ ...context, codes: [] })!;
  const url = new URL(
    savedSearchHref({ ...saved, search_context: parsed }),
    "https://example.test"
  );
  expect(url.searchParams.get("codes")).toBe("73721");
});

it("accepts the short DRG aliases in a real heart-transplant pricing plan", async () => {
  const { buildPricingPlan } = await import("@/lib/cpt/pricing-plan");
  const codes = [
    {
      code: "33945",
      codeType: "cpt" as const,
      description: "Heart transplant",
      category: "Surgery",
    },
  ];
  const pricingPlan = buildPricingPlan({ query: "heart transplant", codes });
  expect(
    parseSearchContext({
      version: 1,
      codes,
      interpretation: "Heart transplant",
      pricingPlan,
    })
  ).not.toBeNull();
});

it.each([
  { ...context, codes: [{ ...context.codes[0], codeType: ["hcpcs"] }] },
  {
    ...context,
    pricingPlan: { ...context.pricingPlan, mode: ["procedure_first"] },
  },
  {
    ...context,
    pricingPlan: {
      ...context.pricingPlan,
      baseCodeGroups: [{ codeType: ["hcpcs"], codes: ["73721"] }],
    },
  },
])("rejects coerced enum values", (value) => {
  expect(parseSearchContext(value)).toBeNull();
});
