import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
const rpc = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    functions: { invoke },
    rpc,
    from: () => ({ upsert }),
  }),
}));

import {
  EMBED_TIMEOUT_MS,
  MATCH_THRESHOLD,
  embedText,
  matchCanonical,
  writeCanonicalEmbedding,
} from "@/lib/kb/semantic";

const VECTOR = Array.from({ length: 384 }, (_, i) => i / 384);

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: { embedding: VECTOR }, error: null });
  rpc.mockResolvedValue({
    data: [{ canonical_query: "knee mri", similarity: 0.97 }],
    error: null,
  });
  upsert.mockResolvedValue({ error: null });
});

afterEach(() => vi.useRealTimers());

describe("embedText", () => {
  it("sends the normalized query to the embed function", async () => {
    expect(await embedText("  MRI of my  Knee ")).toEqual(VECTOR);
    expect(invoke).toHaveBeenCalledWith("embed", {
      body: { input: "mri of my knee" },
    });
  });

  it("returns null for errors or wrong-sized vectors", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("down") });
    expect(await embedText("knee")).toBeNull();

    invoke.mockResolvedValueOnce({ data: { embedding: [1, 2] }, error: null });
    expect(await embedText("knee")).toBeNull();
  });
});

describe("matchCanonical", () => {
  it("returns the nearest canonical above the threshold", async () => {
    expect(await matchCanonical("MRI of my knee")).toBe("knee mri");
    expect(rpc).toHaveBeenCalledWith("match_canonical", {
      query_embedding: JSON.stringify(VECTOR),
      match_threshold: MATCH_THRESHOLD,
      match_count: 1,
    });
  });

  it("returns null when nothing clears the threshold", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await matchCanonical("knee pain")).toBeNull();
  });

  it("returns null without matching when embedding fails", async () => {
    invoke.mockRejectedValueOnce(new Error("network"));
    expect(await matchCanonical("knee")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gives up after the timeout so search is never slower", async () => {
    vi.useFakeTimers();
    invoke.mockReturnValueOnce(new Promise(() => {}));

    const pending = matchCanonical("knee");
    await vi.advanceTimersByTimeAsync(EMBED_TIMEOUT_MS);

    expect(await pending).toBeNull();
  });
});

describe("writeCanonicalEmbedding", () => {
  it("stores the embedding without overwriting an existing one", async () => {
    expect(await writeCanonicalEmbedding("knee mri")).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      {
        canonical_query: "knee mri",
        embedding: JSON.stringify(VECTOR),
        model: "gte-small",
      },
      { onConflict: "canonical_query", ignoreDuplicates: true }
    );
  });

  it("skips the write when embedding fails", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("down") });
    expect(await writeCanonicalEmbedding("knee mri")).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
