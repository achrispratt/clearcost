import { describe, it, expect } from "vitest";
import { buildPricingPlan } from "@/lib/cpt/pricing-plan";

describe("buildPricingPlan inpatient stays (#173)", () => {
  it("adds the stay's MS-DRGs for surgery billed as a hospital stay", () => {
    const plan = buildPricingPlan({
      query: "heart bypass surgery",
      codes: [
        {
          code: "33533",
          codeType: "cpt",
          description: "CABG arterial",
          category: "Surgery",
        },
      ],
    });
    const drg = plan.baseCodeGroups.find((g) => g.codeType === "ms_drg");
    expect(drg?.codes).toEqual(
      expect.arrayContaining(["231", "232", "233", "234", "235", "236"])
    );
  });

  it("leaves outpatient procedures alone", () => {
    const plan = buildPricingPlan({
      query: "knee mri",
      codes: [
        {
          code: "73721",
          codeType: "cpt",
          description: "MRI knee",
          category: "Imaging",
        },
      ],
    });
    expect(plan.baseCodeGroups.some((g) => g.codeType === "ms_drg")).toBe(
      false
    );
  });
});
