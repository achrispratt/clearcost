import { describe, it, expect } from "vitest";
import { loadDecision, toStagingRow } from "@/lib/crawler/load";
import type { Comparison } from "@/lib/crawler/compare";
import type { CrawledCharge, MrfMeta } from "@/lib/crawler/types";

const meta: MrfMeta = {
  hospitalName: "Example Hospital",
  lastUpdatedOn: "2026-03-01",
  version: "3.0.0",
  locationNames: [],
  addresses: [],
  licenseState: "OR",
};

const agreement = (pairs: number, within25: number) => ({
  pairs,
  within5: within25 / 2,
  within25,
  medianAbsPctDiff: 0.1,
  worst: [],
});

const comparison = (cash: number, negotiated: number): Comparison => ({
  crawledCodes: 100,
  prodCodes: 100,
  sharedCodes: 80,
  onlyCrawled: 20,
  onlyProd: 20,
  cash: agreement(40, cash),
  negotiated: agreement(40, negotiated),
});

const base = {
  rows: 500,
  meta,
  providerState: "OR",
  providerLastUpdated: "2025-03-19",
  comparison: comparison(0.8, 0.87),
};

describe("loadDecision", () => {
  it("loads a newer file that agrees with live prices", () => {
    expect(loadDecision(base)).toEqual({ load: true });
  });

  it("keeps live data that is newer than the file", () => {
    const d = loadDecision({ ...base, providerLastUpdated: "2026-06-01" });
    expect(d.load).toBe(false);
  });

  it("refuses a file licensed in another state", () => {
    const d = loadDecision({ ...base, providerState: "WA" });
    expect(d.load).toBe(false);
  });

  it("refuses a file whose prices mostly disagree (likely the wrong hospital)", () => {
    const d = loadDecision({ ...base, comparison: comparison(0.1, 0.2) });
    expect(d.load).toBe(false);
  });

  it("does not judge agreement on too few shared prices", () => {
    const c = comparison(0, 0);
    c.cash.pairs = 5;
    c.negotiated.pairs = 5;
    expect(loadDecision({ ...base, comparison: c })).toEqual({ load: true });
  });

  it("refuses a file with no date or no rows", () => {
    expect(
      loadDecision({ ...base, meta: { ...meta, lastUpdatedOn: null } }).load
    ).toBe(false);
    expect(loadDecision({ ...base, rows: 0 }).load).toBe(false);
  });
});

describe("toStagingRow", () => {
  it("tags rows with the load and the file date", () => {
    const row = toStagingRow(
      {
        cpt: "73721",
        payer_count: null,
        mrf_last_updated_on: "2026-03-01",
      } as unknown as CrawledCharge,
      "p1",
      "l1"
    );
    expect(row).toMatchObject({
      load_id: "l1",
      provider_id: "p1",
      cpt: "73721",
      source: "cms_mrf",
      payer_count: 0,
      last_updated: "2026-03-01T00:00:00.000Z",
    });
    expect(row).not.toHaveProperty("mrf_url");
  });
});
