import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ upsert }) }),
}));

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    body: JSON.stringify(body),
  });

const valid = {
  email: " Person@Example.com ",
  procedureCode: "470",
  procedureName: "knee replacement",
  consent: true,
};

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
  });

  it("stores a normalized sign-up and upserts on duplicates", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "person@example.com",
        procedure_code: "470",
        procedure_name: "knee replacement",
      }),
      { onConflict: "email,procedure_code" }
    );
  });

  it("rejects sign-ups without consent or with a bad email", async () => {
    const { POST } = await import("@/app/api/waitlist/route");
    expect((await POST(post({ ...valid, consent: false }))).status).toBe(400);
    expect((await POST(post({ ...valid, email: "nope" }))).status).toBe(400);
    expect((await POST(post({ ...valid, procedureName: "" }))).status).toBe(
      400
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 500 when the database write fails", async () => {
    upsert.mockResolvedValue({ error: { message: "down" } });
    const { POST } = await import("@/app/api/waitlist/route");
    expect((await POST(post(valid))).status).toBe(500);
  });
});
