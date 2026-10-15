import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Flip to false after validating no CSP violations in production
const IS_CSP_REPORT_ONLY = true;

const cspDirectives: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.ggpht.com",
  ],
  "font-src": ["'self'"],
  "connect-src": [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://maps.googleapis.com",
    "https://*.googleapis.com",
    "https://*.gstatic.com",
  ],
  "frame-src": ["'none'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'", "https://*.supabase.co"],
  "frame-ancestors": ["'none'"],
};

/** Origin of a configured URL, or undefined when unset or malformed. */
function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

// Analytics and error tracking are off until their keys are set; only then
// may the browser talk to their hosts. Both are read at build time.
const analyticsOrigin = process.env.NEXT_PUBLIC_POSTHOG_KEY
  ? originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com")
  : undefined;
const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
for (const origin of [analyticsOrigin, sentryOrigin]) {
  if (origin) cspDirectives["connect-src"].push(origin);
}

const cspValue = Object.entries(cspDirectives)
  .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
  .join("; ");

const securityHeaders = [
  {
    key: IS_CSP_REPORT_ONLY
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    value: cspValue,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this project. Next otherwise infers the
  // root by walking up for a lockfile; a stray parent lockfile or stale .next
  // cache can make it resolve modules from the parent dir — breaking dev and
  // risking the 40GB+ RAM blowup tracked in vercel/next.js#92978.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set; without it the
// build uploads nothing, prints nothing and contacts no Sentry server.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !uploadSourceMaps || !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !uploadSourceMaps },
  widenClientFileUpload: uploadSourceMaps,
});
