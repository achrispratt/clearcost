import { describe, it, expect } from "vitest";
import {
  MAX_QUERY_CHARS,
  MAX_TURNS,
  validateQuery,
  validateTurns,
} from "@/lib/api-limits";

const turn = { questionId: "q1", selectedOption: "Left knee" };

describe("validateQuery", () => {
  it("accepts a normal query", () => {
    expect(validateQuery("knee mri")).toBeNull();
  });

  it.each([undefined, 42, "", "   "])("rejects missing/blank query %s", (q) => {
    expect(validateQuery(q)).toBe("Query is required");
  });

  it("rejects an oversized query", () => {
    expect(validateQuery("a".repeat(MAX_QUERY_CHARS + 1))).toMatch(
      /characters/
    );
  });
});

describe("validateTurns", () => {
  it("accepts empty and well-formed turns", () => {
    expect(validateTurns([])).toBeNull();
    expect(validateTurns([turn, { ...turn, freeText: "it hurts" }])).toBeNull();
  });

  it("rejects too many turns", () => {
    expect(validateTurns(Array(MAX_TURNS + 1).fill(turn))).toMatch(/At most/);
  });

  it.each([
    ["non-array", "nope"],
    ["missing fields", [{ questionId: "q1" }]],
    ["oversized option", [{ ...turn, selectedOption: "x".repeat(201) }]],
    ["oversized free text", [{ ...turn, freeText: "x".repeat(501) }]],
    ["non-string free text", [{ ...turn, freeText: 5 }]],
  ])("rejects %s", (_label, turns) => {
    expect(validateTurns(turns)).not.toBeNull();
  });
});
