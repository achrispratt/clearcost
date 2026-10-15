import { describe, expect, it } from "vitest";
import {
  cleanWebsite,
  entryForProvider,
  migrationSql,
  recordMatches,
  websiteCandidates,
  type ProviderForMatch,
  type WebsiteRecord,
} from "@/scripts/build-hospital-websites";

const provider: ProviderForMatch = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Flowers Hospital",
  address: "4370 West Main Street Dothan AL 36305",
  state: "AL",
  zip: "36305",
  lat: 31.2209,
  lng: -85.4471,
  cms_ccn: "010055",
};

const rec = (r: Partial<WebsiteRecord>): WebsiteRecord => ({
  source: "hifld",
  url: "https://www.flowershospital.com",
  name: "FLOWERS HOSPITAL",
  ...r,
});

const entry = (
  locationName: string,
  mrfUrl = `https://x.org/${locationName}.json`
) => ({
  locationName,
  mrfUrl,
  sourcePageUrl: null,
  contactName: null,
  contactEmail: null,
});

describe("cleanWebsite", () => {
  it("adds a scheme and keys on the host without www", () => {
    expect(cleanWebsite("www.flowershospital.com")).toEqual({
      url: "http://www.flowershospital.com/",
      host: "flowershospital.com",
    });
  });

  it("rejects placeholders and pages that aren't the hospital's", () => {
    expect(cleanWebsite("NOT AVAILABLE")).toBeNull();
    expect(cleanWebsite("https://www.facebook.com/flowers")).toBeNull();
    expect(cleanWebsite("https://en.wikipedia.org/wiki/X")).toBeNull();
    expect(cleanWebsite("localhost")).toBeNull();
  });
});

describe("recordMatches", () => {
  it("matches a keyed record on CMS number plus ZIP or name", () => {
    expect(recordMatches(provider, rec({ ccn: "010055", zip: "36305" }))).toBe(
      true
    );
    expect(
      recordMatches(provider, rec({ ccn: "010055", zip: "99999", name: "X" }))
    ).toBe(false);
    expect(recordMatches(provider, rec({ ccn: "010056", zip: "36305" }))).toBe(
      false
    );
  });

  it("matches an unkeyed record on street address and name", () => {
    const r = rec({ address: "4370 W MAIN ST", zip: "36305", state: "AL" });
    expect(recordMatches(provider, r)).toBe(true);
    expect(
      recordMatches(provider, { ...r, name: "Dothan Surgery Center" })
    ).toBe(false);
    expect(recordMatches(provider, { ...r, address: "100 Other Rd" })).toBe(
      false
    );
  });

  it("matches on map location only with a strong name match", () => {
    const near = rec({ lat: 31.221, lng: -85.4472 });
    expect(recordMatches(provider, near)).toBe(true);
    expect(recordMatches(provider, { ...near, name: "Southeast Health" })).toBe(
      false
    );
    expect(recordMatches(provider, { ...near, lat: 31.3 })).toBe(false);
  });

  it("never matches a different brand or facility type", () => {
    const r = rec({ address: "4370 W MAIN ST", zip: "36305" });
    expect(
      recordMatches(provider, { ...r, name: "Flowers Rehabilitation Hospital" })
    ).toBe(false);
  });
});

describe("websiteCandidates", () => {
  it("drops a source that gives the hospital two websites", () => {
    const at = { address: "4370 W MAIN ST", zip: "36305" };
    const found = websiteCandidates(provider, [
      rec({ ...at }),
      rec({ ...at, url: "https://other-site.org" }),
      rec({ source: "wikidata", lat: 31.221, lng: -85.4472 }),
    ]);
    expect(found.map((f) => f.source)).toEqual(["wikidata"]);
  });

  it("orders sources by trust", () => {
    const found = websiteCandidates(provider, [
      rec({ source: "wikidata", lat: 31.221, lng: -85.4472 }),
      rec({
        source: "dolthub-transparency-in-pricing",
        ccn: "010055",
        zip: "36305",
      }),
    ]);
    expect(found[0].source).toBe("dolthub-transparency-in-pricing");
  });
});

describe("entryForProvider", () => {
  it("finds the entry that names the hospital", () => {
    expect(
      entryForProvider(provider, [
        entry("Southeast Health Medical Center"),
        entry("Flowers Hospital"),
      ])?.locationName
    ).toBe("Flowers Hospital");
  });

  it("returns null when nothing or two different files tie", () => {
    expect(entryForProvider(provider, [entry("Dothan Surgical")])).toBeNull();
    expect(
      entryForProvider(provider, [
        entry("Flowers Hospital", "https://x.org/a.json"),
        entry("Flowers Hospital", "https://x.org/b.json"),
      ])
    ).toBeNull();
  });
});

describe("migrationSql", () => {
  it("escapes quotes and writes nulls", () => {
    const sql = migrationSql(
      [
        {
          id: provider.id,
          website: "https://st-mary's.org/",
          source: "hifld",
          hptUrl: null,
          location: null,
        },
      ],
      "2026-10-15"
    );
    expect(sql).toContain("'https://st-mary''s.org/'");
    expect(sql).toContain("'hifld', null, null)");
  });
});
