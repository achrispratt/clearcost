import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
const upsert = vi.fn(async () => {
  calls.push("upsert");
  return { error: null };
});
const rpc = vi.fn(async () => {
  calls.push("rpc");
  return { data: true, error: null };
});
const update = vi.fn(() => ({
  eq: () => ({
    eq: async () => {
      calls.push("depth0-update");
      return { error: null };
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ upsert, update }),
    rpc,
  }),
}));

import { writeNode } from "@/lib/kb/write-back";
import { buildPathHashFromSegments } from "@/lib/kb/path-hash";
import type { KBResolutionPayload } from "@/types";

const payload: KBResolutionPayload = {
  type: "resolution",
  codes: [
    { code: "73722", description: "MRI knee w/ contrast", category: "Imaging" },
  ],
  interpretation: "Knee MRI with contrast",
  confidence: "high",
  conversationComplete: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("writeNode flagged-node replacement (#126)", () => {
  it("keeps first-write-wins and asks the DB to replace the node only if flagged", async () => {
    const pathHash = await writeNode({
      canonicalQuery: "knee mri",
      answerSegments: ["right"],
      depth: 1,
      nodeType: "resolution",
      payload,
    });

    expect(pathHash).toBe(buildPathHashFromSegments("knee mri", ["right"]));
    expect(upsert).toHaveBeenCalledWith(expect.anything(), {
      onConflict: "path_hash",
      ignoreDuplicates: true,
    });
    expect(rpc).toHaveBeenCalledWith("kb_replace_flagged_node", {
      p_path_hash: pathHash,
      p_canonical_query: "knee mri",
      p_answer_path: ["right"],
      p_depth: 1,
      p_node_type: "resolution",
      p_payload: payload,
      p_source: "claude",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("replaces a flagged node before the depth-0 question replace runs", async () => {
    await writeNode({
      canonicalQuery: "knee mri",
      answerSegments: [],
      depth: 0,
      nodeType: "question",
      payload: {
        type: "question",
        question: { id: "q1", question: "Which knee?", options: [] },
        confidence: "low",
      },
    });

    expect(calls).toEqual(["upsert", "rpc", "depth0-update"]);
  });

  it("skips the replace when the insert itself failed", async () => {
    upsert.mockResolvedValueOnce({ error: { message: "boom" } } as never);
    await writeNode({
      canonicalQuery: "knee mri",
      answerSegments: ["right"],
      depth: 1,
      nodeType: "resolution",
      payload,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
