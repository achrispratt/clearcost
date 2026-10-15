import { describe, expect, it } from "vitest";
import { hptTxtUrl, parseHptTxt } from "@/lib/crawler/hpt-txt";

describe("parseHptTxt", () => {
  it("reads every entry of a multi-location file", () => {
    const text = [
      "location-name: Example Main Hospital",
      "source-page-url: https://example.org/prices",
      "mrf-url: https://example.org/files/111_main_standardcharges.json",
      "contact-name: Jane Doe",
      "contact-email: jane@example.org",
      "",
      "location-name: Example North Hospital",
      "source-page-url: https://example.org/prices",
      "mrf-url: https://example.org/files/222_north_standardcharges.csv",
      "contact-name: Jane Doe",
      "contact-email: jane@example.org",
    ].join("\n");
    expect(parseHptTxt(text)).toEqual([
      {
        locationName: "Example Main Hospital",
        sourcePageUrl: "https://example.org/prices",
        mrfUrl: "https://example.org/files/111_main_standardcharges.json",
        contactName: "Jane Doe",
        contactEmail: "jane@example.org",
      },
      {
        locationName: "Example North Hospital",
        sourcePageUrl: "https://example.org/prices",
        mrfUrl: "https://example.org/files/222_north_standardcharges.csv",
        contactName: "Jane Doe",
        contactEmail: "jane@example.org",
      },
    ]);
  });

  it("tolerates CRLF, a BOM, banners, missing blank lines and odd casing", () => {
    const text =
      "﻿*****************\r\n" +
      "* Instructions: copy the source-page-url into your browser *\r\n" +
      "Location-Name:  A Hospital \r\n" +
      "MRF-URL: https://a.example.org/a.json\r\n" +
      "location-name: B Hospital\r\n" +
      "mrf-url: https://b.example.org/b.zip\r\n";
    expect(parseHptTxt(text).map((e) => [e.locationName, e.mrfUrl])).toEqual([
      ["A Hospital", "https://a.example.org/a.json"],
      ["B Hospital", "https://b.example.org/b.zip"],
    ]);
  });

  it("drops repeated entries and entries without a usable MRF URL", () => {
    const block = (name: string, url: string) =>
      `location-name: ${name}\nmrf-url: ${url}\n\n`;
    const text =
      block("Same", "https://x.example.org/1.json") +
      block("Same", "https://x.example.org/1.json") +
      block("No URL", "") +
      block("Not http", "ftp://x.example.org/2.json") +
      block("Relative", "/files/3.json");
    expect(parseHptTxt(text).map((e) => e.locationName)).toEqual(["Same"]);
  });

  it("starts a new entry when a key repeats even without location-name", () => {
    const text =
      "mrf-url: https://x.example.org/1.json\n" +
      "mrf-url: https://x.example.org/2.json\n";
    expect(parseHptTxt(text).map((e) => e.mrfUrl)).toEqual([
      "https://x.example.org/1.json",
      "https://x.example.org/2.json",
    ]);
  });
});

describe("hptTxtUrl", () => {
  it("points at the site root for a bare host or any URL on it", () => {
    expect(hptTxtUrl("www.example.org")).toBe(
      "https://www.example.org/cms-hpt.txt"
    );
    expect(hptTxtUrl("https://www.example.org/patients/billing")).toBe(
      "https://www.example.org/cms-hpt.txt"
    );
  });
});
