import type { PostHog, CaptureResult, Properties } from "posthog-js";

import { redactUrl } from "@/lib/redact-url";

/**
 * Product analytics (PostHog), off unless NEXT_PUBLIC_POSTHOG_KEY is set.
 *
 * Without a key nothing is loaded: posthog-js is only imported once the key
 * is present, and `track()` is a no-op. Events carry no PII: no emails,
 * names, or coordinates, and every URL is stripped of its query string.
 */

/** Every event the app sends, with its properties. */
export interface AnalyticsEvents {
  search_performed: { query: string; has_location: boolean };
  results_viewed: { hospital_count: number; has_estimates: boolean };
  estimate_expanded: { provider_id: string; codes: string[] };
  cta_clicked: {
    cta: "call" | "directions" | "website";
    provider_id: string;
  };
  estimate_saved: { code_count: number };
  waitlist_signup: { procedure_code: string | null };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

const DEFAULT_HOST = "https://us.i.posthog.com";
const MAX_PENDING = 50;

/** PostHog properties that hold a full URL. */
const URL_PROPERTIES = [
  "$current_url",
  "$referrer",
  "$initial_current_url",
  "$initial_referrer",
  "$prev_pageview_url",
];

let client: PostHog | null = null;
// Events fired while posthog-js is still loading; null when analytics is off.
let pending: [AnalyticsEvent, Properties][] | null = null;

function redactUrls(props: Properties | undefined): void {
  if (!props) return;
  for (const key of URL_PROPERTIES) {
    if (typeof props[key] === "string") props[key] = redactUrl(props[key]);
  }
}

function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  redactUrls(event.properties);
  redactUrls(event.$set);
  redactUrls(event.$set_once);
  return event;
}

/** Starts PostHog in the browser when a key is configured. */
export async function initAnalytics(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === "undefined" || pending || client) return;

  pending = [];
  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || DEFAULT_HOST,
      defaults: "2026-05-30",
      person_profiles: "identified_only",
      // No replay, surveys or other scripts fetched from PostHog's CDN.
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      session_recording: { maskAllInputs: true },
      // Autocaptured clicks keep the element type but never its text,
      // attributes, or input values. Errors go to Sentry instead.
      mask_all_text: true,
      mask_all_element_attributes: true,
      capture_exceptions: false,
      before_send: scrubEvent,
    });
    client = posthog;
    for (const [event, props] of pending) client.capture(event, props);
  } catch {
    // Blocked or failed to load: analytics stays off.
  } finally {
    pending = null;
  }
}

/** Records a product event. Never throws; does nothing when analytics is off. */
export function track<E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E]
): void {
  try {
    if (client) {
      client.capture(event, properties);
    } else if (pending && pending.length < MAX_PENDING) {
      pending.push([event, properties]);
    }
  } catch {
    // Analytics must never break the page (ad blockers, network errors).
  }
}
