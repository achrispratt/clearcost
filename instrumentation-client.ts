import * as Sentry from "@sentry/nextjs";

import { initAnalytics } from "@/lib/analytics";
import { sentryOptions } from "@/lib/sentry-options";

// Runs in the browser before the app hydrates. Both services stay off, and
// nothing is sent anywhere, until their public keys are set.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) Sentry.init(sentryOptions(sentryDsn));

void initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
