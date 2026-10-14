import { describe, it, expect } from "vitest";
import { isDoctorFeeComparable } from "@/lib/cpt/medicare-scope";

describe("isDoctorFeeComparable (#175)", () => {
  it("allows surgery and visit codes", () => {
    expect(isDoctorFeeComparable("27447")).toBe(true);
    expect(isDoctorFeeComparable("33533")).toBe(true);
    expect(isDoctorFeeComparable("99213")).toBe(true);
  });

  it("skips imaging, lab, anesthesia and HCPCS codes", () => {
    expect(isDoctorFeeComparable("73721")).toBe(false);
    expect(isDoctorFeeComparable("80053")).toBe(false);
    expect(isDoctorFeeComparable("00142")).toBe(false);
    expect(isDoctorFeeComparable("G0121")).toBe(false);
  });
});
