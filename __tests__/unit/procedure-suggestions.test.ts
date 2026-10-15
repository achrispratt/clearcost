import { describe, expect, it } from "vitest";
import { suggestProcedures } from "@/lib/procedure-suggestions";

describe("suggestProcedures", () => {
  it("matches word starts in any order", () => {
    expect(suggestProcedures("mri kn")).toEqual(["Knee MRI"]);
    expect(suggestProcedures("colon")).toEqual(["Colonoscopy"]);
  });

  it("returns nothing for one character or no match", () => {
    expect(suggestProcedures("k")).toEqual([]);
    expect(suggestProcedures("zzz")).toEqual([]);
  });

  it("caps the list", () => {
    expect(suggestProcedures("mri").length).toBeLessThanOrEqual(6);
  });
});
