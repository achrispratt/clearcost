import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthogMock }));

async function loadAnalytics() {
  vi.resetModules();
  return import("@/lib/analytics");
}

describe("analytics", () => {
  beforeEach(() => {
    posthogMock.init.mockReset();
    posthogMock.capture.mockReset();
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing without NEXT_PUBLIC_POSTHOG_KEY", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const { initAnalytics, track } = await loadAnalytics();

    await initAnalytics();
    track("estimate_saved", { code_count: 1 });

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("does not throw when called before init", async () => {
    const { track } = await loadAnalytics();
    expect(() =>
      track("search_performed", { query: "knee mri", has_location: true })
    ).not.toThrow();
  });

  it("sends events once a key is set, including ones fired while loading", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { initAnalytics, track } = await loadAnalytics();

    const loading = initAnalytics();
    track("results_viewed", { hospital_count: 3, has_estimates: true });
    await loading;
    track("estimate_saved", { code_count: 2 });

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        person_profiles: "identified_only",
        disable_session_recording: true,
      })
    );
    expect(posthogMock.capture).toHaveBeenNthCalledWith(1, "results_viewed", {
      hospital_count: 3,
      has_estimates: true,
    });
    expect(posthogMock.capture).toHaveBeenNthCalledWith(2, "estimate_saved", {
      code_count: 2,
    });
  });

  it("never throws when PostHog does (e.g. blocked by an ad blocker)", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    posthogMock.capture.mockImplementation(() => {
      throw new Error("blocked");
    });
    const { initAnalytics, track } = await loadAnalytics();
    await initAnalytics();

    expect(() =>
      track("cta_clicked", { cta: "call", provider_id: "p1" })
    ).not.toThrow();
  });

  it("strips query strings from URLs before sending", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { initAnalytics } = await loadAnalytics();
    await initAnalytics();

    const { before_send } = posthogMock.init.mock.calls[0][1];
    const event = before_send({
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url:
          "https://clearcost.live/results?q=knee%20mri&lat=40.7128&lng=-74.006",
      },
      $set_once: { $initial_current_url: "https://clearcost.live/?lat=1" },
    });

    expect(event.properties.$current_url).toBe(
      "https://clearcost.live/results"
    );
    expect(event.$set_once.$initial_current_url).toBe(
      "https://clearcost.live/"
    );
  });
});
