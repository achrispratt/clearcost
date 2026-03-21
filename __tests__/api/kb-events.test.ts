import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/kb/events", () => ({
  logKBEvent: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/kb/events/route";
import { logKBEvent } from "@/lib/kb/events";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/kb/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/kb/events", () => {
  it("returns 200 for valid event", async () => {
    const res = await POST(
      makeRequest({
        pathHash: "abc123",
        eventType: "result_click",
        sessionId: "sess-1",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(logKBEvent).toHaveBeenCalledWith({
      pathHash: "abc123",
      eventType: "result_click",
      sessionId: "sess-1",
    });
  });

  it("returns 400 for missing pathHash", async () => {
    const res = await POST(
      makeRequest({ eventType: "walk", sessionId: "sess-1" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing sessionId", async () => {
    const res = await POST(makeRequest({ pathHash: "abc", eventType: "walk" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid eventType", async () => {
    const res = await POST(
      makeRequest({
        pathHash: "abc",
        eventType: "invalid_type",
        sessionId: "sess-1",
      })
    );
    expect(res.status).toBe(400);
  });

  it("accepts all valid event types", async () => {
    const validTypes = ["walk", "result_click", "save", "bounce", "skip"];
    for (const eventType of validTypes) {
      const res = await POST(
        makeRequest({ pathHash: "abc", eventType, sessionId: "sess-1" })
      );
      expect(res.status).toBe(200);
    }
  });

  it("returns 500 when logKBEvent throws", async () => {
    vi.mocked(logKBEvent).mockRejectedValue(new Error("DB error"));
    const res = await POST(
      makeRequest({
        pathHash: "abc",
        eventType: "walk",
        sessionId: "sess-1",
      })
    );
    expect(res.status).toBe(500);
  });
});
