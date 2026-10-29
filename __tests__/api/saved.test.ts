import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/saved/route";
const { insert, auth } = vi.hoisted(() => ({ insert: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/api-helpers", () => ({
  requireAuth: auth,
  handleApiError: () =>
    NextResponse.json({ error: "Internal error" }, { status: 500 }),
}));
const context = {
  version: 1,
  codes: [
    {
      code: "73721",
      codeType: "cpt",
      description: "Knee MRI",
      category: "Imaging",
    },
  ],
  interpretation: "Right knee",
  laterality: "right",
  bodySite: "knee",
};
const body = {
  query: "my knee",
  location: "NYC",
  cptCodes: ["73721"],
  lat: 40.75,
  lng: -74,
  searchContext: context,
};
const request = (data: unknown) =>
  new NextRequest("http://localhost/api/saved", {
    method: "POST",
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: "saved" }, error: null }),
    }),
  });
  auth.mockResolvedValue({
    user: { id: "owner" },
    supabase: { from: () => ({ insert }) },
  });
});
describe("saving resolved searches", () => {
  it("persists validated search context under the authenticated owner", async () => {
    const response = await POST(request({ ...body, user_id: "attacker" }));
    expect(response?.status).toBe(201);
    const stored = insert.mock.calls[0][0];
    expect(stored.user_id).toBe("owner");
    expect(stored.search_context).toMatchObject(context);
  });
  it("rejects malformed context before writing", async () => {
    expect(
      (await POST(request({ ...body, searchContext: { version: 999 } })))
        ?.status
    ).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it("keeps old clients working without a snapshot", async () => {
    expect(
      (await POST(request({ ...body, searchContext: undefined })))?.status
    ).toBe(201);
  });
  it("requires authentication before accepting saved context", async () => {
    auth.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await POST(request(body)))?.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });
});

it("rejects array-valued code types instead of silently changing the billing system", async () => {
  expect(
    (
      await POST(
        request({
          ...body,
          searchContext: {
            ...context,
            codes: [{ ...context.codes[0], codeType: ["hcpcs"] }],
          },
        })
      )
    )?.status
  ).toBe(400);
  expect(insert).not.toHaveBeenCalled();
});

it("accepts a typed short MS-DRG alias", async () => {
  const code = {
    code: "1",
    codeType: "ms_drg",
    description: "Stay",
    category: "Surgery",
  };
  expect(
    (
      await POST(
        request({
          ...body,
          cptCodes: ["1"],
          searchContext: { ...context, codes: [code] },
        })
      )
    )?.status
  ).toBe(201);
});
