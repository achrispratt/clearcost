import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/kb/path-hash", () => ({
  computeQueryHash: vi.fn().mockReturnValue({
    normalizedQuery: "knee mri",
    queryHash: "hash123",
  }),
  buildPathHashFromSegments: vi.fn().mockReturnValue("path123"),
  turnToSegment: vi.fn().mockReturnValue("segment"),
}));

import { writeBackClarifyResponse } from "@/lib/kb/write-back";

beforeEach(() => vi.clearAllMocks());

describe("writeBackClarifyResponse depth-0 guard", () => {
  it("does NOT write resolution node at depth 0 (no turns)", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [],
      response: {
        codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
        interpretation: "Knee MRI",
        confidence: "high",
        conversationComplete: true,
      },
    });

    expect(result).toBeNull();
  });

  it("DOES write question node at depth 0", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [],
      response: {
        codes: [],
        interpretation: "Need to clarify",
        confidence: "low",
        conversationComplete: false,
        nextQuestion: {
          id: "q1",
          question: "Which knee?",
          options: [{ label: "Left" }, { label: "Right" }],
        },
      },
    });

    expect(result).toBe("path123");
  });

  it("DOES write resolution node at depth > 0", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [{ questionId: "q1", selectedOption: "Left knee" }],
      response: {
        codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
        interpretation: "Left knee MRI",
        confidence: "high",
        conversationComplete: true,
      },
    });

    expect(result).toBe("path123");
  });
});
