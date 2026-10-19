import { describe, it, expect } from "vitest";
import { compareSnapshots, formatReport } from "@/lib/data-checks/compare";
import {
  SNAPSHOT_VERSION,
  type HospitalPrice,
  type ProviderFingerprint,
  type SearchSnapshot,
  type Snapshot,
} from "@/lib/data-checks/types";

function hospital(
  id: string,
  state: string,
  amount: number,
  type: HospitalPrice["type"] = "cash"
): HospitalPrice {
  return { id, name: `Hospital ${id}`, state, amount, type, scope: "complete" };
}

function search(
  hospitals: HospitalPrice[],
  key = "knee-mri|new-york-ny"
): SearchSnapshot {
  const priced = hospitals.filter((h) => h.type !== "gross");
  const amounts = priced.map((h) => h.amount).sort((a, b) => a - b);
  return {
    key,
    procedure: key.split("|")[0],
    metro: key.split("|")[1],
    state: "NY",
    answer: {
      state: priced.length ? "priced" : "no_prices",
      rangeCount: priced.length,
      low: amounts[0],
      median: amounts[Math.floor(amounts.length / 2)],
      high: amounts[amounts.length - 1],
    },
    hospitals,
  };
}

function snapshot(
  searches: SearchSnapshot[],
  options: Partial<Snapshot> = {}
): Snapshot {
  return {
    version: SNAPSHOT_VERSION,
    label: "s",
    takenAt: "2026-10-19T00:00:00Z",
    states: [],
    referenceHash: "ref",
    nationalMedians: { "knee-mri": 1500 },
    searches,
    providers: {},
    ...options,
  };
}

const kinds = (r: ReturnType<typeof compareSnapshots>) =>
  r.findings.map((f) => `${f.severity}:${f.kind}`);

describe("compareSnapshots", () => {
  const base = [
    hospital("a", "NY", 900),
    hospital("b", "NJ", 1200),
    hospital("c", "NY", 2000),
  ];

  it("passes when nothing changed", () => {
    const r = compareSnapshots(
      snapshot([search(base)]),
      snapshot([search(base)])
    );
    expect(r.counts).toEqual({ fail: 0, review: 0, info: 0 });
    expect(r.stats.pricedHospitalsAfter).toBe(3);
  });

  it("fails when a hospital loses its price, in scope or not", () => {
    const after = [base[0], { ...base[1], type: "gross" as const }];
    const r = compareSnapshots(
      snapshot([search(base)], { states: ["NY"] }),
      snapshot([search(after)], { states: ["NY"] })
    );
    expect(kinds(r).filter((k) => k === "fail:hospital_lost")).toHaveLength(2);
  });

  it("only reviews in-scope price moves, and fails outside scope", () => {
    const after = [
      hospital("a", "NY", 1400), // +56%, in scope: review
      hospital("b", "NJ", 1250), // outside scope: fail
      hospital("c", "NY", 2100), // +5%, in scope: info
    ];
    const r = compareSnapshots(
      snapshot([search(base)], { states: ["NY"] }),
      snapshot([search(after)], { states: ["NY"] })
    );
    expect(kinds(r)).toEqual([
      "fail:price_changed_outside_scope",
      "review:price_changed",
      "info:price_changed",
    ]);
  });

  it("downgrades outside-scope moves to review when the filters moved", () => {
    const after = [base[0], hospital("b", "NJ", 1300), base[2]];
    const r = compareSnapshots(
      snapshot([search(base)]),
      snapshot([search(after)], { referenceHash: "new" })
    );
    expect(r.referenceChanged).toBe(true);
    expect(kinds(r)).toEqual(["review:price_changed_outside_scope"]);
  });

  it("fails a newly implausible price and reviews an unpublished page", () => {
    const after = [hospital("a", "NY", 90), hospital("c", "NY", 20000)];
    const r = compareSnapshots(
      snapshot([search(base)], { states: ["NY"] }),
      snapshot([search(after)], { states: ["NY"] })
    );
    expect(kinds(r)).toContain("fail:implausible_price");
    expect(kinds(r)).toContain("fail:hospital_lost");
    expect(kinds(r)).toContain("review:page_unpublished");
  });

  it("counts newly priced hospitals as info", () => {
    const r = compareSnapshots(
      snapshot([search(base)]),
      snapshot([search([...base, hospital("d", "NY", 1000)])])
    );
    expect(kinds(r)).toEqual(["info:hospital_gained"]);
    expect(r.stats.hospitalsGained).toBe(1);
  });

  it("fails when a code loses all its prices at a hospital", () => {
    const before: Record<string, ProviderFingerprint> = {
      p1: {
        name: "Hospital p1",
        state: "TX",
        lastLoaded: null,
        codes: {
          "73721": [2, 2, 800, 900, 1200, 1300],
          "DRG:470": [1, 1, 30000, 30000, null, null],
        },
      },
      p2: {
        name: "Hospital p2",
        state: "TX",
        lastLoaded: null,
        codes: { "80053": [1, 1, 50, 50, null, null] },
      },
    };
    const after: Record<string, ProviderFingerprint> = {
      p1: {
        ...before.p1,
        lastLoaded: "2026-10-20T00:00:00Z",
        codes: {
          "73721": [1, 1, 850, 850, null, null],
          "DRG:470": [1, 0, null, null, null, null],
        },
      },
    };
    const r = compareSnapshots(
      snapshot([], { providers: before }),
      snapshot([], { providers: after })
    );
    expect(kinds(r)).toEqual(["fail:codes_lost", "fail:provider_missing"]);
    expect(r.findings[0].message).toContain("DRG:470");
    expect(r.stats.providersReloaded).toBe(1);
  });

  it("writes a report that leads with the verdict", () => {
    const after = [base[0], base[2]];
    const before = snapshot([search(base)], { label: "before-tx" });
    const later = snapshot([search(after)], { label: "after-tx" });
    const report = formatReport(before, later, compareSnapshots(before, later));
    expect(report).toContain("# Data check: before-tx → after-tx");
    expect(report).toContain("**FAIL**");
    expect(report).toContain("Hospital lost its price (1)");
  });
});
