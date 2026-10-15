import { describe, it, expect } from "vitest";
import { buildPricingPlan } from "@/lib/cpt/pricing-plan";
import { inpatientStayFor } from "@/lib/cpt/inpatient-stays";
import stayDrgs from "@/lib/data/import-sets/inpatient-stay-drgs.json";

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

  it.each([
    ["22633", "spinal fusion", "451"],
    ["22558", "spinal fusion", "451"],
    ["27130", "hip replacement", "470"],
    ["27125", "hip replacement", "522"],
    ["27447", "knee replacement", "470"],
    ["43644", "weight-loss surgery", "621"],
    ["43775", "weight-loss surgery", "621"],
    ["43846", "weight-loss surgery", "621"],
    ["59400", "vaginal delivery", "807"],
    ["59610", "vaginal delivery", "807"],
    ["59510", "C-section delivery", "788"],
    ["59618", "C-section delivery", "788"],
  ])("prices %s as a %s stay from DRG %s", (code, label, drg) => {
    const stay = inpatientStayFor([{ code, codeType: "cpt" }]);
    expect(stay?.label).toBe(label);
    expect(stay?.typicalDrgs[0]).toBe(drg);
    const plan = buildPricingPlan({
      query: label,
      codes: [
        { code, codeType: "cpt", description: label, category: "Surgery" },
      ],
    });
    const group = plan.baseCodeGroups.find((g) => g.codeType === "ms_drg");
    expect(group?.codes).toEqual(expect.arrayContaining(stay!.drgs));
  });

  it("leaves cervical fusion out (it groups to DRGs not imported)", () => {
    expect(inpatientStayFor([{ code: "22551", codeType: "cpt" }])).toBeNull();
  });

  it("imports every DRG a stay can be billed under", () => {
    for (const code of ["22633", "27130", "27447", "43644", "59400", "59510"]) {
      const stay = inpatientStayFor([{ code, codeType: "cpt" }])!;
      expect(stayDrgs).toEqual(expect.arrayContaining(stay.drgs));
    }
  });

  it("only prices a stay from rows that describe it", () => {
    // Revenue codes 0460 (pulmonary function) and 0470 (audiology) land in
    // the DRG column of some hospital files as 460 and 470.
    const fusion = inpatientStayFor([{ code: "22633", codeType: "cpt" }])!;
    expect(
      fusion.describes.test("SPINAL FUSION EXCEPT CERVICAL WITHOUT MCC")
    ).toBe(true);
    expect(fusion.describes.test("OXIMETRY TEST")).toBe(false);
    expect(fusion.describes.test("HC CO DIFFUSION")).toBe(false);
    const knee = inpatientStayFor([{ code: "27447", codeType: "cpt" }])!;
    expect(
      knee.describes.test(
        "MAJOR HIP AND KNEE JOINT REPLACEMENT OR REATTACHMENT"
      )
    ).toBe(true);
    expect(knee.describes.test("NEWBORN HEARING SCREEN")).toBe(false);
    const bariatric = inpatientStayFor([{ code: "43775", codeType: "cpt" }])!;
    expect(
      bariatric.describes.test("O.R. PROCEDURES FOR OBESITY WITHOUT CC/MCC")
    ).toBe(true);
    expect(bariatric.describes.test("XR NEEDLE TROCAR")).toBe(false);
    const csection = inpatientStayFor([{ code: "59510", codeType: "cpt" }])!;
    expect(
      csection.describes.test(
        "NEONATE, BIRTH WEIGHT >2499 GRAMS, WITH MINOR ABDOMINAL PROCEDURES"
      )
    ).toBe(false);
  });
});
