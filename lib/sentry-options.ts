import type { Breadcrumb, Event } from "@sentry/nextjs";

import { redactUrl } from "@/lib/redact-url";

function scrubRequest<T extends Event>(event: T): T {
  if (event.request) {
    if (event.request.url) event.request.url = redactUrl(event.request.url);
    delete event.request.query_string;
  }
  return event;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = redactUrl(data[key]);
    }
  }
  return breadcrumb;
}

/** Server-side DSN; the browser reads NEXT_PUBLIC_SENTRY_DSN directly. */
export function serverSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

/**
 * Sentry options shared by the browser, Node and edge runtimes. Used only
 * when a DSN is set. No PII, no session replay, 10% of traces, and URLs lose
 * their query string (search pages carry the user's coordinates there).
 */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: scrubRequest,
    beforeSendTransaction: scrubRequest,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
