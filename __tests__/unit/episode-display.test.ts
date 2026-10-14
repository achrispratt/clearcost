import { describe, it, expect } from "vitest";
import { describeEpisode } from "@/lib/results/episode-display";
import type { EpisodeEstimate, EpisodeLine } from "@/types";

function line(overrides: Partial<EpisodeLine> = {}): EpisodeLine {
  return {
    code: "73721",
    isPrincipal: false,
    source: "cash",
    confidence: "high",
    estimate: 100,
    min: 100,
    max: 100,
    ...overrides,
  };
}

function estimate(overrides: Partial<EpisodeEstimate> = {}): EpisodeEstimate {
  const lines = overrides.lines ?? [line({ isPrincipal: true }), line()];
  return {
    episodeId: "e1",
    principalCode: "27447",
    label: "Knee replacement",
    estimatedAllInMedian: 200,
    estimatedAllInMin: 200,
    estimatedAllInMax: 200,
    componentCount: lines.length,
    priceableCount: lines.length,
    coverageRatio: 1,
    cashCoverageRatio: 1,
    confidence: "high",
    billingClass: "facility",
    lines,
    missingCodes: [],
    source: "turquoise_ssp",
    ...overrides,
  };
}

describe("describeEpisode", () => {
  it("returns nothing without an estimate or total", () => {
    expect(describeEpisode(undefined)).toBeNull();
    expect(
      describeEpisode(estimate({ estimatedAllInMedian: undefined }))
    ).toBeNull();
  });

  it("adds no caveats when every part is a published cash price", () => {
    const d = describeEpisode(estimate())!;
    expect(d.heading).toBe("Est. hospital total, all parts");
    expect(d.confidenceLabel).toBe("From published cash prices");
    expect(d.notes).toEqual([]);
  });

  it("never presents converted lines as cash prices", () => {
    const d = describeEpisode(
      estimate({
        confidence: "medium",
        lines: [
          line({ isPrincipal: true }),
          line({
            source: "insured_converted",
            confidence: "medium",
            ratioScope: "hospital",
          }),
        ],
      })
    )!;
    expect(d.confidenceLabel).toBe("Partly estimated");
    expect(d.notes[0]).toBe(
      "1 part of 2 has no published cash price, so we estimated it from what insurers pay there."
    );
  });

  it("says when national averages and list prices were used", () => {
    const d = describeEpisode(
      estimate({
        confidence: "low",
        lines: [
          line({ isPrincipal: true, source: "gross_converted" }),
          line({ source: "gross_converted", ratioScope: "national" }),
        ],
      })
    )!;
    expect(d.notes[0]).toBe(
      "2 parts of 2 have no published cash price, so we estimated them from its list prices using national averages."
    );
  });

  it("calls out parts it couldn't price", () => {
    const d = describeEpisode(
      estimate({
        componentCount: 4,
        missingCodes: ["01402", "J2704"],
        confidence: "low",
      })
    )!;
    expect(d.notes).toContain(
      "We couldn't find a price for 2 parts of 4, so the real total may be higher."
    );
    expect(d.missingCodes).toEqual(["01402", "J2704"]);
  });

  it("labels a doctors'-fees-only estimate", () => {
    const d = describeEpisode(estimate({ billingClass: "professional" }))!;
    expect(d.heading).toBe("Est. doctors' fees, all parts");
    expect(d.notes).toContain(
      "Doctors' fees only. The hospital's own fee isn't included."
    );
  });
});
