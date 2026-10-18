import { describe, it, expect } from "vitest";
import { buildPricingPlan } from "@/lib/cpt/pricing-plan";
import type { CPTCode } from "@/types";

const kneeMri: CPTCode = {
  code: "73721",
  codeType: "cpt",
  description: "MRI knee",
  category: "Imaging",
};

describe("buildPricingPlan adders", () => {
  it("does not add the searched procedure as an extra", () => {
    const plan = buildPricingPlan({ query: "knee mri", codes: [kneeMri] });
    expect(plan.mode).toBe("procedure_first");
    expect(plan.adders).toEqual([]);
  });

  it("drops a model adder that repeats a base code", () => {
    const plan = buildPricingPlan({
      query: "knee mri",
      codes: [kneeMri],
      modelPricingPlan: {
        mode: "procedure_first",
        queryType: "procedure",
        baseCodeGroups: [{ codeType: "cpt", codes: ["73721"] }],
        adders: [
          {
            id: "mri_scan",
            label: "MRI",
            codeGroups: [{ codeType: "cpt", codes: ["73721", "70551"] }],
            required: false,
          },
          {
            id: "xray",
            label: "X-ray",
            codeGroups: [{ codeType: "cpt", codes: ["73564"] }],
            required: false,
          },
        ],
      },
    });
    expect(plan.adders.map((a) => a.id)).toEqual(["xray"]);
  });

  it("still suggests likely tests for a symptom visit", () => {
    const plan = buildPricingPlan({
      query: "my back hurts, might need an mri",
      queryType: "symptom",
    });
    expect(plan.mode).toBe("encounter_first");
    expect(plan.adders.map((a) => a.id)).toContain("mri_scan");
  });
});
