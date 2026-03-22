import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the zipcodes package
vi.mock("zipcodes", () => ({
  default: {
    lookup: vi.fn((zip: string) => {
      if (zip === "08624") {
        return {
          zip: "08624",
          latitude: 40.2171,
          longitude: -74.7429,
          city: "Trenton",
          state: "NJ",
        };
      }
      return null;
    }),
    lookupByName: vi.fn(() => null),
  },
}));

describe("GET /api/geocode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns 400 when address is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const { GET } = await import("@/app/api/geocode/route");
    const req = new NextRequest("http://localhost/api/geocode");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("includes country:US restriction in Google API call", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          results: [
            {
              geometry: { location: { lat: 40.2171, lng: -74.7429 } },
              formatted_address: "Trenton, NJ 08624, USA",
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");

    const { GET } = await import("@/app/api/geocode/route");
    const req = new NextRequest(
      "http://localhost/api/geocode?address=08624"
    );
    const res = await GET(req);
    const data = await res.json();

    // Verify the Google API was called with country restriction
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("components=country:US");

    // Verify correct US coordinates returned (not Seoul)
    expect(data.lat).toBeCloseTo(40.2171, 1);
    expect(data.lng).toBeCloseTo(-74.7429, 1);
    expect(data.formatted).toBe("Trenton, NJ 08624, USA");

    vi.unstubAllGlobals();
  });

  it("falls back to zipcodes package when no API key", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const { GET } = await import("@/app/api/geocode/route");
    const req = new NextRequest(
      "http://localhost/api/geocode?address=08624"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.lat).toBeCloseTo(40.2171, 1);
    expect(data.lng).toBeCloseTo(-74.7429, 1);
    expect(data.formatted).toContain("Trenton");
  });

  it("returns 404 for unknown location without API key", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const { GET } = await import("@/app/api/geocode/route");
    const req = new NextRequest(
      "http://localhost/api/geocode?address=xyznotaplace"
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});
