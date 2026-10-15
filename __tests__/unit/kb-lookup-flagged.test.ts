import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal chainable Supabase mock: from(table).select().eq().maybeSingle()
// resolves to the row configured for that table; update().eq() records bumps.
const rows: Record<string, unknown> = {};
const update = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        }),
      }),
      update: (values: unknown) => {
        update(table, values);
        return {
          eq: () => ({
            then: (cb: (r: { error: null }) => void) => cb({ error: null }),
          }),
        };
      },
    }),
  }),
}));

import { kbLookup } from "@/lib/kb/lookup";
import { buildPathHash } from "@/lib/kb/path-hash";

const turns = [{ questionId: "q1", selectedOption: "Right" }];

function resolutionNode(extra: Record<string, unknown> = {}) {
  return {
    path_hash: buildPathHash("knee mri", turns),
    canonical_query: "knee mri",
    answer_path: ["right"],
    depth: 1,
    node_type: "resolution",
    payload: {
      type: "resolution",
      codes: [{ code: "73721", description: "MRI knee", category: "Imaging" }],
      interpretation: "Right knee MRI",
      confidence: "high",
      conversationComplete: true,
    },
    hit_count: 4,
    version: 1,
    source: "claude",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows.kb_synonyms = { canonical_query: "knee mri" };
});

describe("kbLookup flagged nodes (#126)", () => {
  it("serves an unflagged node as a hit and bumps hit_count", async () => {
    rows.kb_nodes = resolutionNode({ flagged_at: null });

    const result = await kbLookup("MRI knee", turns);

    expect(result.hit).toBe(true);
    expect(result.node?.payload.type).toBe("resolution");
    expect(result.flagged).toBeUndefined();
    expect(update).toHaveBeenCalledWith(
      "kb_nodes",
      expect.objectContaining({ hit_count: 5 })
    );
  });

  it("treats a flagged node as a miss so the path falls through to Claude", async () => {
    rows.kb_nodes = resolutionNode({
      flagged_at: "2026-10-15T03:15:00Z",
      flag_reason: "auto: bounce rate 40%",
    });

    const result = await kbLookup("MRI knee", turns);

    expect(result.hit).toBe(false);
    expect(result.node).toBeUndefined();
    expect(result.flagged).toBe(true);
    // canonical + path_hash still returned so write-back targets the same node
    expect(result.canonical_query).toBe("knee mri");
    expect(result.path_hash).toBe(buildPathHash("knee mri", turns));
    expect(update).not.toHaveBeenCalled();
  });
});
