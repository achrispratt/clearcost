import * as Sentry from "@sentry/nextjs";

import { sentryOptions, serverSentryDsn } from "@/lib/sentry-options";

// Runs once per server and edge runtime. Error tracking stays off until a
// DSN is set (SENTRY_DSN, or NEXT_PUBLIC_SENTRY_DSN shared with the browser).
export function register() {
  const dsn = serverSentryDsn();
  if (dsn) Sentry.init(sentryOptions(dsn));
}

// Errors from Server Components, route handlers and middleware.
export const onRequestError = Sentry.captureRequestError;
