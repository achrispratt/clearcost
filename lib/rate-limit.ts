import { type NextRequest } from "next/server";

// Requests per 60-second window, keyed by API path
const RATE_LIMITS: Record<string, number> = {
  "/api/search": 100,
  "/api/cpt": 50,
  "/api/clarify": 50,
};

const WINDOW_MS = 60_000;

// Module-level window — shared across all requests in a single isolate
let currentWindow = {
  counts: new Map<string, number>(),
  expiresAt: Date.now() + WINDOW_MS,
};

type RateLimitResult =
  | { blocked: true; headers: Record<string, string>; retryAfterMs: number }
  | { blocked: false; headers: Record<string, string> };

/**
 * Check rate limit for a request. Returns null if the path isn't rate-limited,
 * otherwise returns the decision with pre-built response headers.
 */
export function applyRateLimit(request: NextRequest): RateLimitResult | null {
  const limit = RATE_LIMITS[request.nextUrl.pathname];
  if (limit === undefined) return null;

  const now = Date.now();

  // Reset the entire window when expired
  if (now >= currentWindow.expiresAt) {
    currentWindow = { counts: new Map(), expiresAt: now + WINDOW_MS };
  }

  const ip = getClientIp(request);
  const key = `${ip}:${request.nextUrl.pathname}`;
  const count = currentWindow.counts.get(key) ?? 0;
  const resetAt = currentWindow.expiresAt;

  if (count >= limit) {
    return {
      blocked: true,
      headers: buildHeaders(limit, 0, resetAt, now),
      retryAfterMs: Math.max(0, resetAt - now),
    };
  }

  currentWindow.counts.set(key, count + 1);
  return {
    blocked: false,
    headers: buildHeaders(limit, limit - count - 1, resetAt, now),
  };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function buildHeaders(
  limit: number,
  remaining: number,
  resetAt: number,
  now: number
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    "Retry-After": String(Math.max(1, Math.ceil((resetAt - now) / 1000))),
  };
}
