import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/kb/lookup", () => ({
  kbLookup: vi.fn(),
  getKnownCanonicals: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/kb/write-back", () => ({
  writeBackClarifyResponse: vi.fn().mockResolvedValue(undefined),
  writeSynonym: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/kb/events", () => ({
  logKBEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/cpt/translate", () => ({
  assessQuery: vi.fn(),
  clarifyQuery: vi.fn(),
  translateQueryToCPT: vi.fn(),
}));

import { POST } from "@/app/api/clarify/route";
import { kbLookup } from "@/lib/kb/lookup";
import { assessQuery, clarifyQuery } from "@/lib/cpt/translate";
import { writeSynonym } from "@/lib/kb/write-back";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/clarify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/clarify", () => {
  it("returns 400 when query is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Query is required");
  });

  it("returns cached response on KB hit", async () => {
    vi.mocked(kbLookup).mockResolvedValue({
      hit: true,
      canonical_query: "knee pain",
      path_hash: "abc123",
      node: {
        path_hash: "abc123",
        canonical_query: "knee pain",
        answer_path: [],
        depth: 0,
        node_type: "question",
        payload: {
          type: "question" as const,
          question: {
            id: "q1",
            question: "What kind of knee care?",
            options: [
              { label: "Imaging" },
              { label: "Surgery" },
            ],
          },
          confidence: "low" as const,
        },
        hit_count: 3,
        version: 1,
        source: "claude",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });

    const res = await POST(makeRequest({ query: "my knee hurts" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.nextQuestion).toBeDefined();
    expect(data.nextQuestion.question).toBe("What kind of knee care?");
    expect(data.kbSessionId).toBeDefined();

    // Should NOT have called Claude
    expect(assessQuery).not.toHaveBeenCalled();
    expect(clarifyQuery).not.toHaveBeenCalled();
  });

  it("calls assessQuery on KB miss with no turns", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });
    vi.mocked(assessQuery).mockResolvedValue({
      codes: [],
      interpretation: "",
      confidence: "low" as const,
      nextQuestion: {
        id: "q1",
        question: "What are you looking for?",
        options: [{ label: "Imaging" }],
      },
      conversationComplete: false,
    });

    const res = await POST(makeRequest({ query: "my knee hurts" }));
    expect(res.status).toBe(200);
    expect(assessQuery).toHaveBeenCalled();
    expect(clarifyQuery).not.toHaveBeenCalled();
  });

  it("calls clarifyQuery on KB miss with turns", async () => {
    vi.mocked(kbLookup).mockResolvedValue({ hit: false });
    vi.mocked(clarifyQuery).mockResolvedValue({
      codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
      interpretation: "Knee MRI",
      confidence: "high" as const,
      conversationComplete: true,
    });

    const turns = [{ questionId: "q1", selectedOption: "Imaging" }];
    const res = await POST(
      makeRequest({ query: "my knee hurts", turns })
    );

    expect(res.status).toBe(200);
    expect(clarifyQuery).toHaveBeenCalledWith("my knee hurts", turns);
    expect(assessQuery).not.toHaveBeenCalled();
  });

  it("ignores depth-0 resolution nodes and falls through to Claude", async () => {
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
        payload: {
          type: "resolution" as const,
          codes: [{ code: "73721", description: "MRI knee", category: "Imaging" }],
          interpretation: "Knee MRI",
          confidence: "high" as const,
          conversationComplete: true,
        },
        hit_count: 5,
        version: 1,
        source: "claude",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });

    vi.mocked(assessQuery).mockResolvedValue({
      codes: [],
      interpretation: "You need a knee MRI",
      confidence: "low" as const,
      nextQuestion: {
        id: "q_laterality",
        question: "Which knee do you need imaged?",
        options: [
          { label: "Left knee" },
          { label: "Right knee" },
          { label: "Both knees" },
        ],
      },
      conversationComplete: false,
    });

    const res = await POST(makeRequest({ query: "knee MRI" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(assessQuery).toHaveBeenCalled();
    expect(data.nextQuestion).toBeDefined();
    expect(data.nextQuestion.question).toContain("knee");
  });

  it("handles synonym clustering: writes synonym but falls through for depth-0 resolution", async () => {
    vi.mocked(kbLookup)
      .mockResolvedValueOnce({ hit: false })
      .mockResolvedValueOnce({
        hit: true,
        canonical_query: "knee mri",
        path_hash: "existing-hash",
        node: {
          path_hash: "existing-hash",
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
          hit_count: 5,
          version: 1,
          source: "claude",
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
        },
      });

    vi.mocked(assessQuery).mockResolvedValue({
      codes: [],
      interpretation: "You need a knee MRI",
      confidence: "low" as const,
      nextQuestion: {
        id: "q1",
        question: "Which knee?",
        options: [{ label: "Left" }, { label: "Right" }],
      },
      conversationComplete: false,
      canonicalMatch: "knee mri",
    });

    const res = await POST(makeRequest({ query: "I need an MRI on my knee" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    // Should return Claude's question, NOT the cached resolution
    expect(data.nextQuestion).toBeDefined();
    expect(data.nextQuestion.question).toBe("Which knee?");

    // Synonym should still be written
    expect(writeSynonym).toHaveBeenCalledWith(
      "I need an MRI on my knee",
      "knee mri"
    );
  });
});
