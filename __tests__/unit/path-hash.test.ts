import { describe, it, expect } from "vitest";
import {
  normalizeQuery,
  sha256,
  computeQueryHash,
  turnToSegment,
  buildPathHash,
  buildPathHashFromSegments,
} from "@/lib/kb/path-hash";
import type { ClarificationTurn } from "@/types";

describe("normalizeQuery", () => {
  it("trims whitespace", () => {
    expect(normalizeQuery("  knee mri  ")).toBe("knee mri");
  });

  it("lowercases", () => {
    expect(normalizeQuery("Knee MRI")).toBe("knee mri");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeQuery("knee   mri   scan")).toBe("knee mri scan");
  });

  it("handles all transforms together", () => {
    expect(normalizeQuery("  Knee   MRI  ")).toBe("knee mri");
  });
});

describe("computeQueryHash", () => {
  it("returns normalized query and hash", () => {
    const result = computeQueryHash("Knee MRI");
    expect(result.normalizedQuery).toBe("knee mri");
    expect(result.queryHash).toBe(sha256("knee mri"));
  });

  it("is deterministic — same input produces same hash", () => {
    const a = computeQueryHash("Knee MRI");
    const b = computeQueryHash("Knee MRI");
    expect(a.queryHash).toBe(b.queryHash);
  });

  it("normalizes before hashing — equivalent queries produce same hash", () => {
    const a = computeQueryHash("  KNEE  mri ");
    const b = computeQueryHash("knee mri");
    expect(a.queryHash).toBe(b.queryHash);
  });
});

describe("turnToSegment", () => {
  it("returns lowercased option for normal selections", () => {
    const turn: ClarificationTurn = {
      questionId: "q1",
      selectedOption: "Knee imaging (X-ray or MRI)",
    };
    expect(turnToSegment(turn)).toBe("knee imaging (x-ray or mri)");
  });

  it("returns null for 'other' with freeText", () => {
    const turn: ClarificationTurn = {
      questionId: "q1",
      selectedOption: "other",
      freeText: "something custom",
    };
    expect(turnToSegment(turn)).toBeNull();
  });

  it("returns 'other' when selectedOption is 'other' without freeText", () => {
    const turn: ClarificationTurn = {
      questionId: "q1",
      selectedOption: "other",
    };
    expect(turnToSegment(turn)).toBe("other");
  });
});

describe("buildPathHash", () => {
  it("returns hash for query with no turns", () => {
    const result = buildPathHash("knee mri", []);
    expect(result).toBe(sha256("knee mri|"));
  });

  it("includes turn segments in the hash", () => {
    const turns: ClarificationTurn[] = [
      { questionId: "q1", selectedOption: "Imaging" },
      { questionId: "q2", selectedOption: "MRI" },
    ];
    const result = buildPathHash("knee pain", turns);
    expect(result).toBe(sha256("knee pain|imaging|mri"));
  });

  it("returns null when a turn has 'other' with freeText", () => {
    const turns: ClarificationTurn[] = [
      { questionId: "q1", selectedOption: "other", freeText: "custom input" },
    ];
    expect(buildPathHash("knee pain", turns)).toBeNull();
  });
});

describe("buildPathHashFromSegments", () => {
  it("produces deterministic hash from canonical query and segments", () => {
    const a = buildPathHashFromSegments("knee mri", ["imaging", "mri"]);
    const b = buildPathHashFromSegments("knee mri", ["imaging", "mri"]);
    expect(a).toBe(b);
  });

  it("matches buildPathHash for equivalent inputs", () => {
    const turns: ClarificationTurn[] = [
      { questionId: "q1", selectedOption: "Imaging" },
    ];
    const fromTurns = buildPathHash("knee mri", turns);
    const fromSegments = buildPathHashFromSegments("knee mri", ["imaging"]);
    expect(fromTurns).toBe(fromSegments);
  });
});
