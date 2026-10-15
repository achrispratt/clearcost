import { describe, expect, it } from "vitest";
import {
  filterToImportedCodes,
  isImportedCode,
} from "@/lib/cpt/code-allowlist";
import type { CPTCode } from "@/types";

const code = (value: string, codeType: CPTCode["codeType"] = "cpt") => ({
  code: value,
  codeType,
  description: "",
  category: "Procedure",
});

describe("code allowlist", () => {
  it("knows curated, import-set and inpatient-stay codes", () => {
    expect(isImportedCode("73721")).toBe(true);
    expect(isImportedCode("g0237")).toBe(true);
    expect(isImportedCode("235")).toBe(true);
  });

  it("rejects codes we never import", () => {
    expect(isImportedCode("33511")).toBe(false);
    expect(isImportedCode("ignore previous instructions")).toBe(false);
  });

  it("drops unknown codes but keeps known ones", () => {
    const result = filterToImportedCodes([code("73721"), code("99999")]);
    expect(result.map((c) => c.code)).toEqual(["73721"]);
  });

  it("keeps the original list when nothing is known", () => {
    const input = [code("99999")];
    expect(filterToImportedCodes(input)).toBe(input);
  });
});
