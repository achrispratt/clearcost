import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the route
vi.mock("@/lib/kb/lookup", () => ({
  kbLookup: vi.fn(),
}));

vi.mock("@/lib/kb/write-back", () => ({
  writeSynonym: vi.fn().mockResolvedValue(undefined),
  writeNode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cpt/translate", () => ({
  translateQueryToCPT: vi.fn(),
}));

import { POST } from "@/app/api/cpt/route";
import { kbLookup } from "@/lib/kb/lookup";
import { writeSynonym, writeNode } from "@/lib/kb/write-back";
import { translateQueryToCPT } from "@/lib/cpt/translate";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/cpt", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/cpt", () => {
  it("returns 400 when query is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Query is required");
  });

  it("returns cached codes on KB hit (no Claude call)", async () => {
    const cachedPayload = {
      type: "resolution" as const,
      codes: [{ code: "73721", description: "MRI knee", category: "Imaging" }],
      interpretation: "Knee MRI",
      confidence: "high" as const,
      conversationComplete: true,
    };

    vi.mocked(kbLookup).mockResolvedValue({
      hit: true,
      canonical_query: "knee mri",
      path_hash: "abc123",
      node: {
        path_hash: "abc123",
        canonical_query: "knee mri",
        answer_path: [],
        depth: 0,
        node_type: "resolution",
        payload: cachedPayload,
        hit_count: 5,
        version: 1,
        source: "claude",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });

    const res = await POST(makeRequest({ query: "knee MRI" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.codes).toEqual(cachedPayload.codes);
    expect(data.interpretation).toBe("Knee MRI");

    // Claude should NOT have been called
    expect(translateQueryToCPT).not.toHaveBeenCalled();
  });

  it("calls Claude on KB miss and writes back to KB", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });

    const claudeResult = {
      codes: [
        { code: "73721", description: "MRI knee", category: "Imaging" },
      ],
      interpretation: "Knee MRI without contrast",
      confidence: "high" as const,
    };
    vi.mocked(translateQueryToCPT).mockResolvedValue(claudeResult);

    const res = await POST(makeRequest({ query: "knee MRI" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.codes).toEqual(claudeResult.codes);

    // Claude should have been called
    expect(translateQueryToCPT).toHaveBeenCalledWith("knee MRI");

    // Write-back should have been called (fire-and-forget)
    expect(writeSynonym).toHaveBeenCalled();
    expect(writeNode).toHaveBeenCalled();
  });

  it("returns 500 when Claude throws", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });
    vi.mocked(translateQueryToCPT).mockRejectedValue(
      new Error("API timeout")
    );

    const res = await POST(makeRequest({ query: "knee MRI" }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to translate query");
  });

  it("still returns result even if KB write-back fails (silent failure)", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });
    vi.mocked(translateQueryToCPT).mockResolvedValue({
      codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
      interpretation: "MRI",
      confidence: "high" as const,
    });
    vi.mocked(writeSynonym).mockRejectedValue(new Error("DB error"));
    vi.mocked(writeNode).mockRejectedValue(new Error("DB error"));

    const res = await POST(makeRequest({ query: "knee MRI" }));
    // Response should still be 200 — write-back is best-effort
    expect(res.status).toBe(200);
  });
});
