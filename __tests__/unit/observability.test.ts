import { afterEach, describe, expect, it, vi } from "vitest";

const sentryMock = vi.hoisted(() => ({
  isEnabled: vi.fn(() => false),
  captureException: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentryMock);

import { reportError } from "@/lib/observability";
import { redactUrl } from "@/lib/redact-url";

describe("reportError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sentryMock.isEnabled.mockReset().mockReturnValue(false);
    sentryMock.captureException.mockReset();
  });

  it("falls back to console.error when Sentry is off", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");

    reportError(err, "Clarify API error:");

    expect(log).toHaveBeenCalledWith("Clarify API error:", err);
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("passes extra details to the console line", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("timeout");

    reportError(err, "Charge lookup error:", { stage: "primary" });

    expect(log).toHaveBeenCalledWith("Charge lookup error:", err, {
      stage: "primary",
    });
  });

  it("wraps plain Supabase error objects when Sentry is on", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sentryMock.isEnabled.mockReturnValue(true);
    const supabaseError = { message: "relation does not exist", code: "42P01" };

    reportError(supabaseError, "Waitlist insert failed:");

    const [exception, hint] = sentryMock.captureException.mock.calls[0];
    expect(exception).toBeInstanceOf(Error);
    expect(exception.message).toBe(
      "Waitlist insert failed: relation does not exist"
    );
    expect(hint).toEqual({
      tags: { context: "Waitlist insert failed" },
      extra: { error: supabaseError },
    });
  });

  it("never throws when Sentry does", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sentryMock.isEnabled.mockReturnValue(true);
    sentryMock.captureException.mockImplementation(() => {
      throw new Error("sentry down");
    });

    expect(() =>
      reportError(new Error("x"), "Fetch payers error:")
    ).not.toThrow();
  });
});

describe("redactUrl", () => {
  it.each([
    [
      "https://clearcost.live/results?q=mri&lat=40.7&lng=-74",
      "https://clearcost.live/results",
    ],
    [
      "https://clearcost.live/auth/callback?code=abc#x",
      "https://clearcost.live/auth/callback",
    ],
    ["/guided-search?lat=1&lng=2", "/guided-search"],
    ["https://clearcost.live/", "https://clearcost.live/"],
  ])("%s → %s", (input, expected) => {
    expect(redactUrl(input)).toBe(expected);
  });
});
