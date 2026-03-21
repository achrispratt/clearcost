import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/lib/cpt/lookup", () => ({
  lookupWithPricingPlan: vi.fn().mockResolvedValue([]),
  createLookupDiagnostics: vi.fn().mockReturnValue({
    totalTimeouts: 0,
    totalRpcAttempts: 0,
    totalRetries: 0,
    totalFailures: 0,
    totalChunkFallbacks: 0,
    fallbackExhausted: false,
    stageSummaries: [],
  }),
}));
vi.mock("@/lib/cpt/medicare", () => ({
  lookupMedicareBenchmarks: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/cpt/episode", () => ({
  enrichWithEpisodeEstimates: vi
    .fn()
    .mockImplementation((r) => Promise.resolve(r)),
}));
vi.mock("@/lib/cpt/group-results", () => ({
  groupResultsByProvider: vi.fn().mockImplementation((r) => r),
}));
vi.mock("@/lib/api-helpers", () => ({
  handleApiError: vi
    .fn()
    .mockReturnValue(
      new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
    ),
}));
vi.mock("@/lib/cpt/pricing-plan", () => ({
  buildPricingPlan: vi.fn().mockReturnValue({
    mode: "procedure_first",
    queryType: "procedure",
    baseCodeGroups: [{ codeType: "cpt", codes: ["73721"] }],
    adders: [],
  }),
  normalizePricingPlanInput: vi.fn().mockReturnValue(undefined),
}));

import { POST } from "@/app/api/search/route";
import { kbLookup } from "@/lib/kb/lookup";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { lookupWithPricingPlan } from "@/lib/cpt/lookup";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/search", () => {
  it("returns 400 when location is missing", async () => {
    const res = await POST(makeRequest({ query: "knee MRI" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Location is required");
  });

  it("fast path: direct codes skip AI translation", async () => {
    vi.mocked(lookupWithPricingPlan).mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        query: "knee MRI",
        codes: ["73721"],
        codeType: "cpt",
        location: { lat: 30.27, lng: -97.74 },
      })
    );

    expect(res.status).toBe(200);
    // Should NOT have called Claude or KB
    expect(translateQueryToCPT).not.toHaveBeenCalled();
    expect(kbLookup).not.toHaveBeenCalled();
  });

  it("fast path: direct code groups skip AI translation", async () => {
    vi.mocked(lookupWithPricingPlan).mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        query: "knee MRI",
        codeGroups: [{ codeType: "cpt", codes: ["73721", "73722"] }],
        location: { lat: 30.27, lng: -97.74 },
      })
    );

    expect(res.status).toBe(200);
    expect(translateQueryToCPT).not.toHaveBeenCalled();
    expect(kbLookup).not.toHaveBeenCalled();
  });

  it("standard path: KB miss triggers Claude translation", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });
    vi.mocked(translateQueryToCPT).mockResolvedValue({
      codes: [{ code: "73721", description: "MRI knee", category: "Imaging" }],
      interpretation: "Knee MRI",
      confidence: "high" as const,
    });
    vi.mocked(lookupWithPricingPlan).mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        query: "knee MRI",
        location: { lat: 30.27, lng: -97.74 },
      })
    );

    expect(res.status).toBe(200);
    expect(kbLookup).toHaveBeenCalled();
    expect(translateQueryToCPT).toHaveBeenCalledWith("knee MRI");
  });

  it("standard path: KB hit skips Claude", async () => {
    vi.mocked(kbLookup).mockResolvedValue({
      hit: true,
      canonical_query: "knee mri",
      path_hash: "abc",
      node: {
        path_hash: "abc",
        canonical_query: "knee mri",
        answer_path: [],
        depth: 0,
        node_type: "resolution",
        payload: {
          type: "resolution" as const,
          codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
          interpretation: "Knee MRI",
          confidence: "high" as const,
          conversationComplete: true,
        },
        hit_count: 1,
        version: 1,
        source: "claude",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });
    vi.mocked(lookupWithPricingPlan).mockResolvedValue([]);

    const res = await POST(
      makeRequest({
        query: "knee MRI",
        location: { lat: 30.27, lng: -97.74 },
      })
    );

    expect(res.status).toBe(200);
    expect(translateQueryToCPT).not.toHaveBeenCalled();
  });

  it("returns 400 when no query and no codes provided", async () => {
    const res = await POST(
      makeRequest({ location: { lat: 30.27, lng: -97.74 } })
    );
    expect(res.status).toBe(400);
  });
});
