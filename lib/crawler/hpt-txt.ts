// Discovery: hospitals must publish a `cms-hpt.txt` at the root of the public
// website that hosts their machine-readable file (45 CFR 180.50(d)(6)). Each
// entry is a block of `key: value` lines:
//
//   location-name: Example Hospital
//   source-page-url: https://example.org/price-transparency
//   mrf-url: https://example.org/files/123456789_example-hospital_standardcharges.json
//   contact-name: Jane Doe
//   contact-email: jane.doe@example.org
//
// Real files add banners and free text, use CRLF, skip blank lines between
// blocks and repeat entries, so the parser starts a new entry whenever a key
// repeats and ignores anything that is not a known key.

export interface HptTxtEntry {
  locationName: string;
  sourcePageUrl: string | null;
  mrfUrl: string;
  contactName: string | null;
  contactEmail: string | null;
}

const KEYS = {
  "location-name": "locationName",
  "source-page-url": "sourcePageUrl",
  "mrf-url": "mrfUrl",
  "contact-name": "contactName",
  "contact-email": "contactEmail",
} as const;

type Draft = Partial<Record<(typeof KEYS)[keyof typeof KEYS], string>>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Parse a cms-hpt.txt body into entries that carry a usable MRF URL. */
export function parseHptTxt(text: string): HptTxtEntry[] {
  const drafts: Draft[] = [];
  let current: Draft | null = null;

  for (const rawLine of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const match = rawLine.match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (!(key in KEYS)) continue;
    const field = KEYS[key as keyof typeof KEYS];
    if (!current || current[field] !== undefined) {
      current = {};
      drafts.push(current);
    }
    if (match[2]) current[field] = match[2];
  }

  const seen = new Set<string>();
  const entries: HptTxtEntry[] = [];
  for (const d of drafts) {
    if (!d.mrfUrl || !isHttpUrl(d.mrfUrl)) continue;
    const key = `${d.locationName ?? ""}|${d.mrfUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      locationName: d.locationName ?? "",
      sourcePageUrl: d.sourcePageUrl ?? null,
      mrfUrl: d.mrfUrl,
      contactName: d.contactName ?? null,
      contactEmail: d.contactEmail ?? null,
    });
  }
  return entries;
}

/** `https://<host>/cms-hpt.txt` for a bare domain or any URL on that host. */
export function hptTxtUrl(domainOrUrl: string): string {
  const withScheme = /^https?:\/\//i.test(domainOrUrl)
    ? domainOrUrl
    : `https://${domainOrUrl}`;
  return new URL("/cms-hpt.txt", withScheme).toString();
}
