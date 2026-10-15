/**
 * Finds each hospital's website, and the cms-hpt.txt that lists its price
 * files, so the crawler (#25) knows where to look. Also fills the website
 * link on the results card.
 *
 * Sources (all public):
 *   - DoltHub transparency-in-pricing `hospital` (2023): price-file pages by
 *     CMS Certification Number
 *   - DoltHub hospital-price-transparency-v3 `hospitals`: homepages by CMS
 *     Certification Number
 *   - DHS HIFLD Hospitals (validated through 2020): websites with address and
 *     map location
 *   - Wikidata: hospitals in the US with an official website and coordinates
 *
 * A wrong website is worse than none, so matching is strict: a keyed source
 * must agree with our CMS number and ZIP code or name; the others need the
 * same street address or map spot plus a matching name, with no conflicting
 * brand or facility type. A source that gives one hospital two different
 * websites is dropped for it. Each website is then checked by reading its
 * /cms-hpt.txt (45 CFR 180.50(d)(6)): when an entry names the hospital, its
 * file list is stored too.
 *
 * Read-only against production. Writes a migration with the results:
 *   npx tsx --env-file=.env.local scripts/build-hospital-websites.ts
 *   options: --out <migration.sql>  --cache-dir <dir>  --concurrency <n>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

import { parseHptTxt, type HptTxtEntry } from "../lib/crawler/hpt-txt";
import {
  addressKey,
  conflictingNames,
  nameSimilarity,
} from "./import-cms-star-ratings";

export interface ProviderForMatch {
  id: string;
  name: string;
  address: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  cms_ccn: string | null;
}

/** One hospital record from a public source that lists its website. */
export interface WebsiteRecord {
  source: string;
  url: string;
  name: string;
  /** CMS Certification Number, when the source is keyed by it. */
  ccn?: string;
  address?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

export interface WebsiteMatch {
  url: string;
  host: string;
  source: string;
}

/** Most trusted first: newest keyed source, then the others. */
export const SOURCE_PRIORITY = [
  "dolthub-transparency-in-pricing",
  "dolthub-hospital-price-transparency-v3",
  "hifld",
  "wikidata",
];

/** Source label for a website taken from a system's cms-hpt.txt. */
const SYSTEM_SOURCE = "system-cms-hpt-txt";

const zip5 = (z: string | null | undefined) =>
  z?.trim().match(/^\d{5}/)?.[0] ?? null;

export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Different brands or facility types, checked both ways. */
function conflicting(a: string, b: string): boolean {
  return conflictingNames(a, b) || conflictingNames(b, a);
}

/** Same hospital by name: enough shared words and no brand/type conflict. */
export function namesAgree(a: string, b: string, min: number): boolean {
  return !conflicting(a, b) && nameSimilarity(a, b) >= min;
}

// Pages that mention hospitals but aren't theirs.
const NOT_A_HOSPITAL_SITE =
  /(^|\.)(facebook|twitter|instagram|linkedin|youtube|wikipedia|google|yelp|healthgrades|usnews|webmd|medicare|cms|mapquest|yellowpages|bop)\.(com|org|gov)$/;

/** Cleans a source URL; null when it isn't a usable hospital website. */
export function cleanWebsite(
  raw: string | null | undefined
): { url: string; host: string } | null {
  const value = raw?.trim();
  if (!value || /^not available$/i.test(value) || /\s/.test(value)) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `http://${value}`
    );
    if (!/\.[a-z]{2,}$/i.test(url.hostname)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (NOT_A_HOSPITAL_SITE.test(host)) return null;
    url.hash = "";
    return { url: url.toString(), host };
  } catch {
    return null;
  }
}

/**
 * Whether a source record is this provider. Keyed sources match on the CMS
 * number and must agree on ZIP code or name; the rest need the same street
 * address (house number, street, ZIP) or the same spot on the map, plus a
 * matching name.
 */
export function recordMatches(
  provider: ProviderForMatch,
  record: WebsiteRecord
): boolean {
  if (record.ccn) {
    if (!provider.cms_ccn || provider.cms_ccn !== record.ccn) return false;
    if (conflicting(provider.name, record.name)) return false;
    return (
      (zip5(provider.zip) !== null &&
        zip5(provider.zip) === zip5(record.zip)) ||
      nameSimilarity(provider.name, record.name) >= 0.34
    );
  }
  if (record.state && provider.state && record.state !== provider.state)
    return false;
  const key = addressKey(provider.address);
  if (
    key !== null &&
    zip5(provider.zip) !== null &&
    zip5(provider.zip) === zip5(record.zip) &&
    key === addressKey(record.address ?? null)
  ) {
    return namesAgree(provider.name, record.name, 0.34);
  }
  if (
    provider.lat != null &&
    provider.lng != null &&
    record.lat != null &&
    record.lng != null &&
    distanceKm(provider.lat, provider.lng, record.lat, record.lng) <= 0.3
  ) {
    return namesAgree(provider.name, record.name, 0.6);
  }
  return false;
}

/**
 * The website each source gives this provider. A source whose matching
 * records disagree on the website is dropped for the provider: two
 * different answers means neither is confident. Sorted by SOURCE_PRIORITY.
 */
export function websiteCandidates(
  provider: ProviderForMatch,
  records: WebsiteRecord[]
): WebsiteMatch[] {
  const bySource = new Map<string, WebsiteMatch[]>();
  for (const record of records) {
    if (!recordMatches(provider, record)) continue;
    const site = cleanWebsite(record.url);
    if (!site) continue;
    const list = bySource.get(record.source) ?? [];
    list.push({ ...site, source: record.source });
    bySource.set(record.source, list);
  }
  return [...bySource.values()]
    .filter((list) => new Set(list.map((m) => m.host)).size === 1)
    .map((list) => list[0])
    .sort(
      (a, b) =>
        SOURCE_PRIORITY.indexOf(a.source) - SOURCE_PRIORITY.indexOf(b.source)
    );
}

/** The cms-hpt.txt entry that names this provider, if exactly one does. */
export function entryForProvider(
  provider: { name: string },
  entries: HptTxtEntry[],
  min = 0.5
): HptTxtEntry | null {
  const scored = entries
    .filter((e) => namesAgree(provider.name, e.locationName, min))
    .map((e) => ({ e, score: nameSimilarity(provider.name, e.locationName) }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  // Two equally good entries with different files: can't tell which is ours.
  if (
    scored.length > 1 &&
    scored[1].score === scored[0].score &&
    scored[1].e.mrfUrl !== scored[0].e.mrfUrl
  )
    return null;
  return scored[0].e;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const USER_AGENT =
  "ClearCostCrawler/0.1 (hospital price transparency research; +https://www.clearcost.live)";

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/sparql-results+json, application/json",
        },
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err}`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

async function cached<T>(
  dir: string,
  name: string,
  load: () => Promise<T>
): Promise<T> {
  const path = join(dir, name);
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const data = await load();
  writeFileSync(path, JSON.stringify(data));
  return data;
}

type Row = Record<string, string | null>;

async function dolt(repo: string, sql: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const q = encodeURIComponent(`${sql} LIMIT 1000 OFFSET ${offset}`);
    const data = (await getJson(
      `https://www.dolthub.com/api/v1alpha1/dolthub/${repo}?q=${q}`
    )) as { query_execution_status: string; rows: Row[] };
    if (data.query_execution_status !== "Success")
      throw new Error(`DoltHub ${repo}: ${JSON.stringify(data).slice(0, 300)}`);
    rows.push(...data.rows);
    if (data.rows.length < 1000) return rows;
  }
}

const HIFLD_URL =
  "https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/HIFLD_2020_Hospitals/FeatureServer/0/query";

async function hifld(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; ) {
    const params = new URLSearchParams({
      where: "STATUS='OPEN'",
      outFields: "NAME,ADDRESS,STATE,ZIP,WEBSITE,LATITUDE,LONGITUDE",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: "2000",
      f: "json",
    });
    const data = (await getJson(`${HIFLD_URL}?${params}`)) as {
      features: { attributes: Row }[];
      exceededTransferLimit?: boolean;
    };
    rows.push(...data.features.map((f) => f.attributes));
    if (!data.exceededTransferLimit && data.features.length < 2000) return rows;
    offset += data.features.length;
  }
}

const WIKIDATA_QUERY = `SELECT ?h ?hLabel ?w ?coord WHERE {
  ?h wdt:P31/wdt:P279* wd:Q16917 ; wdt:P17 wd:Q30 ; wdt:P856 ?w ; wdt:P625 ?coord .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

async function wikidata(): Promise<Row[]> {
  const data = (await getJson(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(WIKIDATA_QUERY)}`
  )) as { results: { bindings: Record<string, { value: string }>[] } };
  return data.results.bindings.map((b) => {
    const [lng, lat] = b.coord.value.match(/-?[\d.]+/g) ?? [];
    return { name: b.hLabel.value, url: b.w.value, lat, lng };
  });
}

async function loadRecords(cacheDir: string): Promise<WebsiteRecord[]> {
  const num = (v: string | null | undefined) =>
    v == null || v === "" ? undefined : Number(v);
  const tip = await cached(cacheDir, "dolthub-tip.json", () =>
    dolt(
      "transparency-in-pricing/main",
      "SELECT id, name, zip, mrf_url, transparency_page FROM hospital ORDER BY id"
    )
  );
  const v3 = await cached(cacheDir, "dolthub-v3.json", () =>
    dolt(
      "hospital-price-transparency-v3/main",
      "SELECT cms_certification_num, name, zip5, homepage_url FROM hospitals ORDER BY cms_certification_num"
    )
  );
  const hifldRows = await cached(cacheDir, "hifld.json", hifld);
  const wiki = await cached(cacheDir, "wikidata.json", wikidata);

  const records: WebsiteRecord[] = [];
  for (const r of tip) {
    // The price-file page's site, so the hospital's own site root.
    const site = cleanWebsite(r.transparency_page ?? r.mrf_url);
    if (!site || !r.id) continue;
    records.push({
      source: "dolthub-transparency-in-pricing",
      url: new URL("/", site.url).toString(),
      name: r.name ?? "",
      ccn: r.id,
      zip: r.zip ?? undefined,
    });
  }
  for (const r of v3) {
    if (!r.homepage_url || !r.cms_certification_num) continue;
    records.push({
      source: "dolthub-hospital-price-transparency-v3",
      url: r.homepage_url,
      name: r.name ?? "",
      ccn: r.cms_certification_num,
      zip: r.zip5 ?? undefined,
    });
  }
  for (const r of hifldRows) {
    if (!r.WEBSITE) continue;
    records.push({
      source: "hifld",
      url: r.WEBSITE,
      name: r.NAME ?? "",
      address: r.ADDRESS ?? undefined,
      state: r.STATE ?? undefined,
      zip: r.ZIP ?? undefined,
      lat: num(r.LATITUDE),
      lng: num(r.LONGITUDE),
    });
  }
  for (const r of wiki) {
    records.push({
      source: "wikidata",
      url: r.url ?? "",
      name: r.name ?? "",
      lat: num(r.lat),
      lng: num(r.lng),
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Matching with indexes (5k providers x 28k records)
// ---------------------------------------------------------------------------

function indexRecords(records: WebsiteRecord[]) {
  const byCcn = new Map<string, WebsiteRecord[]>();
  const byZip = new Map<string, WebsiteRecord[]>();
  const byCell = new Map<string, WebsiteRecord[]>();
  const push = (m: Map<string, WebsiteRecord[]>, k: string, r: WebsiteRecord) =>
    m.set(k, [...(m.get(k) ?? []), r]);
  for (const r of records) {
    if (r.ccn) push(byCcn, r.ccn, r);
    else {
      const z = zip5(r.zip);
      if (z) push(byZip, z, r);
      if (r.lat != null && r.lng != null)
        push(byCell, `${Math.floor(r.lat * 50)}|${Math.floor(r.lng * 50)}`, r);
    }
  }
  return (p: ProviderForMatch): WebsiteRecord[] => {
    const out = new Set<WebsiteRecord>();
    for (const r of (p.cms_ccn && byCcn.get(p.cms_ccn)) || []) out.add(r);
    const z = zip5(p.zip);
    for (const r of (z && byZip.get(z)) || []) out.add(r);
    if (p.lat != null && p.lng != null) {
      const la = Math.floor(p.lat * 50);
      const ln = Math.floor(p.lng * 50);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const r of byCell.get(`${la + i}|${ln + j}`) ?? []) out.add(r);
    }
    return [...out];
  };
}

// ---------------------------------------------------------------------------
// cms-hpt.txt checks
// ---------------------------------------------------------------------------

interface HptResult {
  url: string;
  entries: HptTxtEntry[];
}

/** Reads cms-hpt.txt at the host (www first). Null when neither has one. */
async function readHpt(host: string): Promise<HptResult | null> {
  for (const h of [`www.${host}`, host]) {
    const url = `https://${h}/cms-hpt.txt`;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const entries = parseHptTxt((await res.text()).slice(0, 2_000_000));
      // Keep the hospital's own URL even when it redirects to a file host.
      if (entries.length > 0) return { url, entries };
    } catch {
      // Unreachable host or bad TLS: treat as no file.
    }
  }
  return null;
}

/** Whether a page loads (2xx after redirects). */
async function loads(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface WebsiteResult {
  id: string;
  website: string;
  source: string;
  hptUrl: string | null;
  location: string | null;
}

const sqlText = (v: string | null) =>
  v == null ? "null" : `'${v.replace(/'/g, "''")}'`;

export function migrationSql(results: WebsiteResult[], asOf: string): string {
  const values = results
    .map(
      (r) =>
        `  ('${r.id}'::uuid, ${sqlText(r.website)}, ${sqlText(r.source)}, ${sqlText(r.hptUrl)}, ${sqlText(r.location)})`
    )
    .join(",\n");
  return `-- Hospital websites and their cms-hpt.txt price-file lists (#25).
-- Generated by scripts/build-hospital-websites.ts on ${asOf}; see that script
-- for sources and matching rules. Re-run it to refresh.
alter table public.providers
  add column if not exists website_source text,
  add column if not exists mrf_index_url text,
  add column if not exists mrf_location_name text,
  add column if not exists website_checked_at date;

comment on column public.providers.website_source is
  'Public dataset the website came from (scripts/build-hospital-websites.ts)';
comment on column public.providers.mrf_index_url is
  'cms-hpt.txt that lists this hospital''s price files, when one names it';
comment on column public.providers.mrf_location_name is
  'location-name of this hospital''s entry in mrf_index_url';

update public.providers p
set website = v.website,
    website_source = v.source,
    mrf_index_url = v.hpt_url,
    mrf_location_name = v.location,
    website_checked_at = date '${asOf}'
from (values
${values}
) as v(id, website, source, hpt_url, location)
where p.id = v.id;
`;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const asOf = new Date().toISOString().slice(0, 10);
  const cacheDir = opt("--cache-dir", join(tmpdir(), "clearcost-websites"));
  const concurrency = Number(opt("--concurrency", "24"));
  const out = opt(
    "--out",
    `supabase/migrations/${asOf.replace(/-/g, "")}090000_provider_websites.sql`
  );
  mkdirSync(cacheDir, { recursive: true });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const providers: ProviderForMatch[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, address, state, zip, lat, lng, cms_ccn")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    providers.push(...(data as ProviderForMatch[]));
    if (data.length < 1000) break;
  }

  const records = await loadRecords(cacheDir);
  console.log(
    `${providers.length} providers, ${records.length} source records`
  );
  const nearby = indexRecords(records);
  const candidates = new Map<string, WebsiteMatch[]>();
  for (const p of providers) {
    const found = websiteCandidates(p, nearby(p));
    if (found.length > 0) candidates.set(p.id, found);
  }
  console.log(`${candidates.size} providers matched to a source`);

  const hosts = [
    ...new Set([...candidates.values()].flat().map((c) => c.host)),
  ];
  console.log(`Reading cms-hpt.txt on ${hosts.length} websites...`);
  // Kept for the day, so a re-run after a matching change skips the fetches.
  const hptCache = join(cacheDir, `hpt-${asOf}.json`);
  const hptByHost = new Map<string, HptResult | null>(
    existsSync(hptCache)
      ? Object.entries(JSON.parse(readFileSync(hptCache, "utf8")))
      : []
  );
  const toRead = hosts.filter((h) => !hptByHost.has(h));
  let done = 0;
  await mapLimit(toRead, concurrency, async (host) => {
    hptByHost.set(host, await readHpt(host));
    if (++done % 250 === 0) console.log(`  ${done} of ${toRead.length}`);
  });
  writeFileSync(hptCache, JSON.stringify(Object.fromEntries(hptByHost)));

  const results: WebsiteResult[] = [];
  for (const p of providers) {
    const found = candidates.get(p.id);
    if (!found) continue;
    // A website whose cms-hpt.txt names this hospital beats source order.
    let pick: WebsiteResult | null = null;
    for (const c of found) {
      const hpt = hptByHost.get(c.host);
      const entry = hpt ? entryForProvider(p, hpt.entries) : null;
      if (entry) {
        pick = {
          id: p.id,
          website: c.url,
          source: c.source,
          hptUrl: hpt!.url,
          location: entry.locationName,
        };
        break;
      }
    }
    pick ??= {
      id: p.id,
      website: found[0].url,
      source: found[0].source,
      hptUrl: null,
      location: null,
    };
    results.push(pick);
  }

  // A website no cms-hpt.txt confirms is kept only if it still loads: the
  // older sources list some domains that have since lapsed.
  const unconfirmed = results.filter((r) => !r.hptUrl);
  console.log(`Checking ${unconfirmed.length} unconfirmed websites load...`);
  const liveCache = join(cacheDir, `live-${asOf}.json`);
  const live = new Map<string, boolean>(
    existsSync(liveCache)
      ? Object.entries(JSON.parse(readFileSync(liveCache, "utf8")))
      : []
  );
  await mapLimit(
    unconfirmed.filter((r) => !live.has(r.website)),
    concurrency,
    async (r) => live.set(r.website, await loads(r.website))
  );
  writeFileSync(liveCache, JSON.stringify(Object.fromEntries(live)));
  const dead = new Set(
    unconfirmed.filter((r) => !live.get(r.website)).map((r) => r.id)
  );
  results.splice(0, results.length, ...results.filter((r) => !dead.has(r.id)));
  console.log(`${dead.size} dropped: website no longer loads`);

  // Systems list every hospital in one cms-hpt.txt. A hospital we found no
  // file list for can take one from a system site already confirmed for
  // another hospital in its state, when exactly one such site names it.
  const statesBySite = new Map<string, Set<string>>();
  const stateOf = new Map(providers.map((p) => [p.id, p.state]));
  for (const r of results) {
    const state = stateOf.get(r.id);
    if (!r.hptUrl || !state) continue;
    const set = statesBySite.get(r.hptUrl) ?? new Set<string>();
    set.add(state);
    statesBySite.set(r.hptUrl, set);
  }
  const entriesBySite = new Map(
    [...hptByHost.values()]
      .filter((h): h is HptResult => h !== null)
      .map((h) => [h.url, h.entries])
  );
  const resultById = new Map(results.map((r) => [r.id, r]));
  let fromSystemSites = 0;
  for (const p of providers) {
    const current = resultById.get(p.id);
    if (current?.hptUrl || !p.state) continue;
    const hits: { site: string; entry: HptTxtEntry }[] = [];
    for (const [site, states] of statesBySite) {
      if (!states.has(p.state)) continue;
      // Only the system site ties it to this hospital, so the name must be
      // the same once generic words are dropped ("PAM Rehabilitation
      // Hospital of Corpus Christi" is not "Corpus Christi Rehabilitation
      // Hospital").
      const entry = entryForProvider(p, entriesBySite.get(site) ?? [], 1);
      if (entry) hits.push({ site, entry });
    }
    if (hits.length !== 1) continue;
    const { site, entry } = hits[0];
    const result: WebsiteResult = current ?? {
      id: p.id,
      website: new URL("/", site).toString(),
      source: SYSTEM_SOURCE,
      hptUrl: null,
      location: null,
    };
    result.hptUrl = site;
    result.location = entry.locationName;
    if (!current) results.push(result);
    fromSystemSites++;
  }
  console.log(`${fromSystemSites} more from system sites`);

  // The cms-hpt.txt was read over https on the same site, so link to https.
  const bare = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  for (const r of results) {
    if (
      r.hptUrl &&
      r.website.startsWith("http:") &&
      bare(r.website) === bare(r.hptUrl)
    )
      r.website = r.website.replace(/^http:/, "https:");
  }

  const withHpt = results.filter((r) => r.hptUrl).length;
  const summary = {
    asOf,
    providers: providers.length,
    withWebsite: results.length,
    withPriceFileList: withHpt,
    websitesChecked: hosts.length,
    websitesWithHptTxt: [...hptByHost.values()].filter(Boolean).length,
    bySource: Object.fromEntries(
      [...SOURCE_PRIORITY, SYSTEM_SOURCE].map((s) => [
        s,
        results.filter((r) => r.source === s).length,
      ])
    ),
  };
  writeFileSync(out, migrationSql(results, asOf));
  writeFileSync(
    join(cacheDir, `summary-${asOf}.json`),
    JSON.stringify({ summary, results }, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${out}`);
}

if (process.argv[1]?.endsWith("build-hospital-websites.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
