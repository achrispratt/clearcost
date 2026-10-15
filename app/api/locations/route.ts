import { NextRequest, NextResponse } from "next/server";
import { suggestLocations } from "@/lib/location-suggest";

const MAX_QUERY_CHARS = 100;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.length > MAX_QUERY_CHARS) {
    return NextResponse.json({ suggestions: [] });
  }
  return NextResponse.json(
    { suggestions: suggestLocations(q) },
    { headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
