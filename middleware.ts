import { updateSession } from "@/lib/supabase/middleware";
import { applyRateLimit } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const rateLimit = applyRateLimit(request);

  if (rateLimit?.blocked) {
    return NextResponse.json(
      {
        error: "Too many requests. Please wait a moment and try again.",
        retryAfterMs: rateLimit.retryAfterMs,
      },
      { status: 429, headers: rateLimit.headers }
    );
  }

  const response = await updateSession(request);
  if (rateLimit) {
    for (const [key, value] of Object.entries(rateLimit.headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
