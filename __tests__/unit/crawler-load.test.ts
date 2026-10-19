import { describe, it, expect } from "vitest";
import {
  loadDecision,
  namesOverlap,
  storableRows,
  toStagingRow,
} from "@/lib/crawler/load";
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
  providerNames: ["Example Hospital"],
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

  it("refuses a file named for another hospital when there is nothing to compare", () => {
    const d = loadDecision({
      ...base,
      meta: { ...meta, hospitalName: "Dayton General Hospital" },
      providerNames: ["Columbia Basin Family Medicine"],
      comparison: null,
    });
    expect(d.load).toBe(false);
  });

  it("trusts the price comparison over the file's name", () => {
    const d = loadDecision({
      ...base,
      meta: {
        ...meta,
        hospitalName: "Adams County Public Hospital District 3",
      },
      providerNames: ["Othello Community Hospital"],
    });
    expect(d).toEqual({ load: true });
  });

  it("refuses a file with no date or no rows", () => {
    expect(
      loadDecision({ ...base, meta: { ...meta, lastUpdatedOn: null } }).load
    ).toBe(false);
    expect(loadDecision({ ...base, rows: 0 }).load).toBe(false);
  });
});

describe("namesOverlap", () => {
  it("matches on a distinctive word, ignoring generic ones", () => {
    expect(
      namesOverlap(
        ["Providence Health And Services - Washington"],
        ["Providence St Mary Medical Center"]
      )
    ).toBe(true);
    expect(
      namesOverlap(["St. Joseph Hospital"], ["Saint Joseph Medical Center"])
    ).toBe(true);
    expect(
      namesOverlap(
        ["Dayton General Hospital"],
        ["Columbia Basin Family Medicine"]
      )
    ).toBe(false);
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

describe("storableRows", () => {
  it("keeps one row per distinct price and drops rows with no price", () => {
    const a = {
      cpt: "73721",
      setting: "outpatient",
      cash_price: 900,
      revenue_code: "0610",
    };
    const relabeled = { ...a, description: "MRI KNEE", revenue_code: "0611" };
    const inpatient = { ...a, setting: "inpatient" };
    const otherPrice = { ...a, cash_price: 950 };
    const otherSide = { ...a, laterality: "left" };
    const empty = { cpt: "73721", cash_price: null, gross_charge: null };
    expect(
      storableRows([a, relabeled, inpatient, otherPrice, otherSide, empty])
    ).toEqual([a, inpatient, otherPrice, otherSide]);
  });
});
