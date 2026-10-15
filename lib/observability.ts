import * as Sentry from "@sentry/nextjs";

/**
 * Logs a caught error and, when Sentry is configured, reports it there too.
 * The console line is written either way, so server logs read as before.
 * Never throws.
 *
 * @param message - Log prefix, also sent as the Sentry `context` tag
 * @param extra - Non-PII details to attach (stage, code counts, error codes)
 */
export function reportError(
  error: unknown,
  message: string,
  extra?: Record<string, unknown>
): void {
  if (extra) console.error(message, error, extra);
  else console.error(message, error);

  try {
    if (!Sentry.isEnabled()) return;
    // Supabase returns plain error objects; wrap them so Sentry groups them
    // by message instead of "Object captured as exception".
    const isError = error instanceof Error;
    Sentry.captureException(
      isError ? error : new Error(`${message} ${describe(error)}`),
      {
        tags: { context: message.replace(/:$/, "") },
        extra: isError ? extra : { ...extra, error },
      }
    );
  } catch {
    // Reporting must never break the request.
  }
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
