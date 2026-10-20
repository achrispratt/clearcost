/**
 * Independent MRF crawler, first slice (#25).
 *
 * Finds hospital machine-readable files through each hospital's cms-hpt.txt,
 * stream-parses them (CMS template JSON, CSV tall, CSV wide; plain, gzip or
 * zip), keeps the curated codes, and writes rows in the `charges` shape to a
 * local NDJSON file. --compare reads production (read-only) to check crawled
 * prices against the Trilliant baseline for the same hospital. Only --load
 * writes to the database.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/crawl-mrf.ts --domain www.ohsu.edu --compare
 *   npx tsx --env-file=.env.local scripts/crawl-mrf.ts \
 *     --domain www.mountsinai.org --location "Mount Sinai Hospital" --max-files 1
 *   npx tsx scripts/crawl-mrf.ts --mrf-url https://example.org/123_x_standardcharges.json
 *
 * Options:
 *   --domain <host>        Hospital website whose /cms-hpt.txt to read (repeatable)
 *   --domains-file <json>  JSON array of hosts
 *   --mrf-url <url>        Skip discovery and crawl this file (repeatable)
 *   --location <text>      Only cms-hpt.txt entries whose location-name contains this
 *   --max-files <n>        At most n files per domain (default: all)
 *   --codes <json>         Code list to keep instead of the default set
 *   --out <file>           NDJSON output (default: <cache-dir>/crawl-<time>.ndjson)
 *   --cache-dir <dir>      Where downloads are kept (default: <tmp>/clearcost-mrf)
 *   --max-mb <n>           Refuse files larger than this (default: 4000)
 *   --refresh              Re-download files already in the cache
 *   --compare              Match each file to a provider and compare with prod
 *   --provider-id <uuid>   Use this provider for --compare instead of matching
 *   --providers <n>        Crawl and compare an evenly spread sample of n providers
 *                          whose stored cms-hpt.txt names them (implies --compare)
 *   --state <XX>           Crawl and compare every such provider in one state
 *                          (implies --compare); downloads are deleted after parsing
 *   --load                 With --state: replace each hospital's live prices with
 *                          its crawled rows when the file passes the load checks
 *                          (lib/crawler/load.ts). Without it, --state is a dry run.
 *   --resume               Continue a run killed partway (machine restart): skip
 *                          files already in <out>.progress.jsonl, keep their results
 *
 * See docs/mrf-crawler.md.
 */

import {
  appendFileSync,
  createWriteStream,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildCodeSet,
  ISSUE_173_DRGS,
  loadDefaultCodeSet,
  type CodeSet,
} from "../lib/crawler/codes";
import {
  addRow,
  compareCodePrices,
  median,
  type CodePrices,
  type Comparison,
  type PriceRow,
} from "../lib/crawler/compare";
import {
  cachePath,
  discoverMrfs,
  downloadMrf,
  openMrf,
} from "../lib/crawler/fetch";
import type { HptTxtEntry } from "../lib/crawler/hpt-txt";
import {
  loadDecision,
  loadProviderRows,
  type LoadResult,
} from "../lib/crawler/load";
import { toCrawledCharge } from "../lib/crawler/normalize";
import { parseCsvMrf } from "../lib/crawler/parse-csv";
import { parseJsonMrf } from "../lib/crawler/parse-json";
import type {
  CrawledCharge,
  MrfMeta,
  ParseStats,
  RawCharge,
} from "../lib/crawler/types";
import { conflictingNames, nameSimilarity } from "./import-cms-star-ratings";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Live memory (JS heap plus buffers) a runaway parse would grow without
// bound. RSS alone isn't the signal: after one big file V8 keeps its heap
// pages, so RSS stays near that file's peak while live memory is ~20 MB,
// and a 1.5 GB RSS limit failed every later file in a state run.
const MAX_LIVE_BYTES = 1.5 * 1024 ** 3;
const MAX_RSS_BYTES = 4 * 1024 ** 3;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Config {
  domains: string[];
  mrfUrls: string[];
  location: string | null;
  maxFiles: number;
  codesFile: string | null;
  out: string | null;
  cacheDir: string;
  maxBytes: number;
  refresh: boolean;
  compare: boolean;
  providerId: string | null;
  providers: number;
  state: string | null;
  load: boolean;
  skipLoaded: boolean;
  resume: boolean;
}

function parseArgs(argv: string[]): Config {
  const config: Config = {
    domains: [],
    mrfUrls: [],
    location: null,
    maxFiles: Infinity,
    codesFile: null,
    out: null,
    cacheDir: join(tmpdir(), "clearcost-mrf"),
    maxBytes: 4000 * 1e6,
    refresh: false,
    compare: false,
    providerId: null,
    providers: 0,
    state: null,
    load: false,
    skipLoaded: false,
    resume: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return v;
    };
    switch (argv[i]) {
      case "--domain":
        config.domains.push(next());
        break;
      case "--domains-file":
        config.domains.push(
          ...(JSON.parse(readFileSync(resolve(next()), "utf8")) as string[])
        );
        break;
      case "--mrf-url":
        config.mrfUrls.push(next());
        break;
      case "--location":
        config.location = next();
        break;
      case "--max-files":
        config.maxFiles = parseInt(next(), 10);
        break;
      case "--codes":
        config.codesFile = resolve(next());
        break;
      case "--out":
        config.out = resolve(next());
        break;
      case "--cache-dir":
        config.cacheDir = resolve(next());
        break;
      case "--max-mb":
        config.maxBytes = parseFloat(next()) * 1e6;
        break;
      case "--refresh":
        config.refresh = true;
        break;
      case "--compare":
        config.compare = true;
        break;
      case "--provider-id":
        config.providerId = next();
        break;
      case "--providers":
        config.providers = parseInt(next(), 10);
        config.compare = true;
        break;
      case "--state":
        config.state = next().toUpperCase();
        config.compare = true;
        break;
      case "--load":
        config.load = true;
        break;
      case "--skip-loaded":
        config.skipLoaded = true;
        break;
      case "--resume":
        config.resume = true;
        break;
      default:
        throw new Error(`Unknown option ${argv[i]}`);
    }
  }
  if (
    config.domains.length === 0 &&
    config.mrfUrls.length === 0 &&
    config.providers === 0 &&
    !config.state
  ) {
    throw new Error(
      "Give at least one --domain, --domains-file, --mrf-url, --providers or --state"
    );
  }
  if (config.load && !config.state) {
    throw new Error("--load works one state at a time: add --state <XX>");
  }
  return config;
}

// ---------------------------------------------------------------------------
// Provider matching (for --compare)
// ---------------------------------------------------------------------------

export interface ProviderCandidate {
  id: string;
  name: string;
  zip: string | null;
}

/** Last ZIP code in an address string. */
export function zipFromAddress(address: string): string | null {
  const zips = address.match(/\b\d{5}(?=(-\d{4})?\b)/g);
  return zips ? zips[zips.length - 1] : null;
}

/** Two-letter state from "..., Houston, TX 77030". */
export function stateFromAddress(address: string): string | null {
  return address.match(/\b([A-Z]{2})\s+\d{5}(-\d{4})?\s*$/)?.[1] ?? null;
}

/**
 * Pick the provider a crawled file belongs to, from providers in its state.
 * Names are scored with the CMS star-rating matcher's word overlap; a shared
 * ZIP lowers the bar, and a different ZIP needs an exact name (a system name
 * like "NYU Langone" otherwise matches every campus). Ambiguous or weak
 * matches return null: comparing against the wrong hospital is worse than
 * not comparing.
 */
export function matchProvider(
  candidates: ProviderCandidate[],
  names: string[],
  zips: string[]
): { provider: ProviderCandidate; score: number } | null {
  const scored = candidates
    .map((provider) => {
      let similarity = 0;
      for (const name of names) {
        if (conflictingNames(name, provider.name)) continue;
        similarity = Math.max(similarity, nameSimilarity(name, provider.name));
      }
      const zipMatch = provider.zip !== null && zips.includes(provider.zip);
      const zipConflict = !zipMatch && provider.zip !== null && zips.length > 0;
      const ok = zipMatch
        ? similarity >= 0.34
        : similarity >= (zipConflict ? 1 : 0.6);
      return { provider, score: similarity + (zipMatch ? 0.5 : 0), ok };
    })
    .filter((s) => s.ok)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.2) return null;
  return { provider: scored[0].provider, score: scored[0].score };
}

async function loadStateProviders(
  supabase: SupabaseClient,
  state: string
): Promise<ProviderCandidate[]> {
  const out: ProviderCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, zip")
      .eq("state", state)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as ProviderCandidate[]));
    if (data.length < 1000) break;
  }
  return out;
}

async function loadProdPrices(
  supabase: SupabaseClient,
  providerId: string
): Promise<Map<string, CodePrices>> {
  const byCode = new Map<string, CodePrices>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("charges")
      .select(
        "cpt, hcpcs, ms_drg, setting, cash_price, avg_negotiated_rate, min_negotiated_rate"
      )
      .eq("provider_id", providerId)
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data as PriceRow[]) addRow(byCode, row);
    if (data.length < 1000) break;
  }
  return byCode;
}

// ---------------------------------------------------------------------------
// Per-file crawl
// ---------------------------------------------------------------------------

interface DrgStat {
  rows: number;
  withCash: number;
  withNegotiated: number;
  perDiemOnly: number;
  withAllowed: number;
  negotiatedMedian: number | null;
  cashMedian: number | null;
  allowedMedian: number | null;
}

interface Target {
  domain: string | null;
  locationName: string | null;
  mrfUrl: string;
  /** Provider this file belongs to, when known up front (--providers). */
  providerId?: string;
  /** Other providers whose cms-hpt.txt entry points at the same file. */
  alsoProviderIds?: string[];
}

interface LoadOutcome {
  providerId: string;
  loaded: boolean;
  reason?: string;
  result?: LoadResult;
  error?: string;
}

interface FileResult extends Target {
  ok: boolean;
  error?: string;
  bytes?: number;
  seconds?: number;
  container?: string;
  format?: string;
  csvLayout?: "tall" | "wide";
  meta?: MrfMeta;
  scanned?: number;
  matchedItems?: number;
  rows?: number;
  rowsByColumn?: Record<string, number>;
  distinctCodes?: number;
  rowsWithCash?: number;
  rowsWithNegotiated?: number;
  issue173Drgs?: Record<string, DrgStat>;
  comparison?: Comparison & {
    providerId: string;
    providerName: string;
    /** Date of the Oria file behind the production rows. */
    providerLastUpdated: string | null;
    matchScore: number | null;
  };
  compareSkipped?: string;
  loads?: LoadOutcome[];
}

function drgReport(rows: CrawledCharge[]): Record<string, DrgStat> {
  const report: Record<string, DrgStat> = {};
  for (const drg of ISSUE_173_DRGS) {
    const hits = rows.filter((r) => r.ms_drg === drg);
    if (hits.length === 0) continue;
    const neg = hits
      .map((r) => r.avg_negotiated_rate)
      .filter((v): v is number => v !== null);
    const cash = hits
      .map((r) => r.cash_price)
      .filter((v): v is number => v !== null && v > 0);
    const allowed = hits
      .map((r) => r.allowed_amount_median)
      .filter((v): v is number => v !== null);
    report[drg] = {
      rows: hits.length,
      withCash: cash.length,
      withNegotiated: neg.length,
      perDiemOnly: hits.filter(
        (r) => r.avg_negotiated_rate === null && r.per_diem_rates_excluded > 0
      ).length,
      withAllowed: allowed.length,
      negotiatedMedian: median(neg),
      cashMedian: median(cash),
      allowedMedian: median(allowed),
    };
  }
  return report;
}

function checkMemory(label: string): void {
  const { rss, heapUsed, external } = process.memoryUsage();
  const mb = (n: number) => (n / 1024 ** 2).toFixed(0);
  if (heapUsed + external > MAX_LIVE_BYTES) {
    throw new Error(
      `${label}: ${mb(heapUsed + external)} MB in use is over the 1.5 GB safety limit`
    );
  }
  if (rss > MAX_RSS_BYTES) {
    throw new Error(
      `${label}: RSS ${mb(rss)} MB is over the 4 GB safety limit`
    );
  }
}

async function crawlFile(
  target: Target,
  config: Config,
  codeSet: CodeSet,
  out: NodeJS.WritableStream,
  supabase: SupabaseClient | null
): Promise<FileResult> {
  const result: FileResult = { ...target, ok: false };
  const started = Date.now();
  try {
    const dl = await downloadMrf(target.mrfUrl, config.cacheDir, {
      maxBytes: config.maxBytes,
      refresh: config.refresh,
    });
    result.bytes = dl.bytes;
    console.log(
      `  ${dl.fromCache ? "cached" : "downloaded"} ${(dl.bytes / 1e6).toFixed(1)} MB`
    );

    const { stream, format, container } = await openMrf(dl.path);
    result.format = format;
    result.container = container;
    const meta: MrfMeta = {
      hospitalName: null,
      lastUpdatedOn: null,
      version: null,
      locationNames: [],
      addresses: [],
      licenseState: null,
    };
    const stats: ParseStats = { scanned: 0, matched: 0 };
    const charges: AsyncGenerator<RawCharge> =
      format === "json"
        ? parseJsonMrf(stream, codeSet, meta, stats)
        : parseCsvMrf(stream, codeSet, meta, stats);

    const drgRows: CrawledCharge[] = [];
    // Kept in memory only when they may be loaded (a few thousand per file).
    const keptRows: CrawledCharge[] | null = config.state ? [] : null;
    const crawledPrices = new Map<string, CodePrices>();
    const distinctCodes = new Set<string>();
    const byColumn: Record<string, number> = { cpt: 0, hcpcs: 0, ms_drg: 0 };
    let kept = 0;
    let withCash = 0;
    let withNegotiated = 0;
    for await (const raw of charges) {
      const row = toCrawledCharge(raw, codeSet, {
        mrfUrl: target.mrfUrl,
        meta,
      });
      if (!row) continue;
      kept++;
      for (const col of ["cpt", "hcpcs", "ms_drg"] as const) {
        if (row[col]) byColumn[col]++;
      }
      if (row.cash_price !== null && row.cash_price > 0) withCash++;
      if (row.avg_negotiated_rate !== null) withNegotiated++;
      if (row.ms_drg && ISSUE_173_DRGS.includes(row.ms_drg)) drgRows.push(row);
      distinctCodes.add(
        row.ms_drg ? `drg ${row.ms_drg}` : (row.cpt ?? row.hcpcs)!
      );
      addRow(crawledPrices, row);
      keptRows?.push(row);
      if (!out.write(JSON.stringify(row) + "\n")) {
        await new Promise((r) => out.once("drain", r));
      }
      if (kept % 5000 === 0) checkMemory(target.mrfUrl);
    }
    checkMemory(target.mrfUrl);

    Object.assign(result, {
      ok: true,
      csvLayout: stats.csvLayout,
      meta,
      scanned: stats.scanned,
      matchedItems: stats.matched,
      rows: kept,
      rowsByColumn: byColumn,
      distinctCodes: distinctCodes.size,
      rowsWithCash: withCash,
      rowsWithNegotiated: withNegotiated,
      issue173Drgs: drgReport(drgRows),
    });

    if (supabase)
      await compareWithProd(result, crawledPrices, config, supabase);
    if (supabase && keptRows && result.providerId)
      result.loads = await checkAndLoad(
        result,
        keptRows,
        crawledPrices,
        config,
        supabase
      );
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    // A state run would otherwise fill the disk with price files.
    if (config.state) {
      try {
        rmSync(cachePath(target.mrfUrl, config.cacheDir), { force: true });
      } catch {
        // best effort
      }
    }
  }
  result.seconds = Math.round((Date.now() - started) / 100) / 10;
  return result;
}

async function compareWithProd(
  result: FileResult,
  crawled: Map<string, CodePrices>,
  config: Config,
  supabase: SupabaseClient
): Promise<void> {
  const meta = result.meta!;
  let providerId = result.providerId ?? config.providerId;
  let matchScore: number | null = null;
  if (!providerId) {
    const state =
      meta.licenseState ??
      meta.addresses.map(stateFromAddress).find((s) => s) ??
      null;
    if (!state) {
      result.compareSkipped = "no state in the file to search providers by";
      return;
    }
    const names = [
      result.locationName,
      meta.hospitalName,
      ...meta.locationNames,
    ].filter((n): n is string => !!n);
    const zips = meta.addresses
      .map(zipFromAddress)
      .filter((z): z is string => !!z);
    const match = matchProvider(
      await loadStateProviders(supabase, state),
      names,
      zips
    );
    if (!match) {
      result.compareSkipped = `no unambiguous provider match in ${state} for ${names.join(" / ")}`;
      return;
    }
    providerId = match.provider.id;
    matchScore = Math.round(match.score * 100) / 100;
  }
  const { data: provider, error } = await supabase
    .from("providers")
    .select("name, last_updated")
    .eq("id", providerId)
    .single();
  if (error) throw error;
  const prod = await loadProdPrices(supabase, providerId);
  result.comparison = {
    providerId,
    providerName: provider.name,
    providerLastUpdated: provider.last_updated,
    matchScore,
    ...compareCodePrices(crawled, prod),
  };
}

/**
 * Run the load checks for every hospital this file belongs to and, with
 * --load, swap each passing hospital's prices to the crawled rows.
 */
async function checkAndLoad(
  result: FileResult,
  rows: CrawledCharge[],
  crawled: Map<string, CodePrices>,
  config: Config,
  supabase: SupabaseClient
): Promise<LoadOutcome[]> {
  const outcomes: LoadOutcome[] = [];
  const ids = [result.providerId!, ...(result.alsoProviderIds ?? [])];
  for (const providerId of ids) {
    try {
      const { data: provider, error } = await supabase
        .from("providers")
        .select("name, state, last_updated, mrf_location_name")
        .eq("id", providerId)
        .single();
      if (error) throw error;
      const comparison =
        providerId === result.comparison?.providerId
          ? result.comparison
          : compareCodePrices(
              crawled,
              await loadProdPrices(supabase, providerId)
            );
      const decision = loadDecision({
        rows: rows.length,
        meta: result.meta!,
        providerState: provider.state,
        providerNames: [provider.name, provider.mrf_location_name].filter(
          Boolean
        ),
        providerLastUpdated: provider.last_updated,
        comparison,
      });
      if (!decision.load) {
        outcomes.push({ providerId, loaded: false, reason: decision.reason });
      } else if (!config.load) {
        outcomes.push({
          providerId,
          loaded: false,
          reason: "dry run: would load",
        });
      } else {
        const loaded = await loadProviderRows(supabase, providerId, rows);
        outcomes.push({ providerId, loaded: true, result: loaded });
      }
    } catch (err) {
      outcomes.push({
        providerId,
        loaded: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number | null) =>
  n === null ? "—" : `$${Math.round(n).toLocaleString()}`;

function printResult(r: FileResult): void {
  if (!r.ok) {
    console.log(`  FAILED: ${r.error}`);
    return;
  }
  const m = r.meta!;
  console.log(
    `  ${r.format}${r.csvLayout ? ` (${r.csvLayout})` : ""}, ${r.container}, template v${m.version ?? "?"}, ` +
      `updated ${m.lastUpdatedOn ?? "?"}, ${r.seconds}s`
  );
  console.log(
    `  ${m.hospitalName ?? "?"} [${m.licenseState ?? "?"}] — scanned ${r.scanned!.toLocaleString()}, ` +
      `kept ${r.rows!.toLocaleString()} rows (${JSON.stringify(r.rowsByColumn)}), ${r.distinctCodes} codes, ` +
      `cash on ${r.rowsWithCash}, negotiated on ${r.rowsWithNegotiated}`
  );
  const drgs = Object.entries(r.issue173Drgs!);
  console.log(
    `  #173 stay DRGs: ${drgs.length ? "" : "none in file"}` +
      drgs
        .map(
          ([d, s]) =>
            `${d} (${s.rows} rows, neg ${money(s.negotiatedMedian)}, cash ${money(s.cashMedian)}, ` +
            `allowed ${money(s.allowedMedian)}` +
            `${s.perDiemOnly ? `, ${s.perDiemOnly} per-diem only` : ""})`
        )
        .join("; ")
  );
  if (r.compareSkipped) console.log(`  compare skipped: ${r.compareSkipped}`);
  for (const l of r.loads ?? []) {
    console.log(
      `  load ${l.providerId}: ` +
        (l.loaded
          ? `loaded ${l.result!.inserted} rows, archived ${l.result!.archived}, replaced ${l.result!.replaced}`
          : l.error
            ? `ERROR ${l.error}`
            : l.reason)
    );
  }
  const c = r.comparison;
  if (c) {
    console.log(
      `  vs prod ${c.providerName} (${c.providerId}${c.matchScore !== null ? `, score ${c.matchScore}` : ""}, ` +
        `Oria file ${c.providerLastUpdated ?? "?"}): ` +
        `${c.sharedCodes} shared code/setting keys, ${c.onlyCrawled} only crawled, ${c.onlyProd} only prod`
    );
    for (const [label, a] of [
      ["cash", c.cash],
      ["negotiated", c.negotiated],
    ] as const) {
      console.log(
        `    ${label}: ${a.pairs} pairs, ${pct(a.within5)} within 5%, ${pct(a.within25)} within 25%, ` +
          `median |diff| ${a.medianAbsPctDiff === null ? "—" : pct(a.medianAbsPctDiff)}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Providers whose cms-hpt.txt names them (scripts/build-hospital-websites.ts):
 * an evenly spread sample of `count`, or every one in `state`. Hospitals that
 * share a price file become one target, so the file is parsed once.
 */
async function providerTargets(
  supabase: SupabaseClient,
  count: number,
  state: string | null = null,
  skipLoaded = false
): Promise<Target[]> {
  const rows: {
    id: string;
    mrf_index_url: string;
    mrf_location_name: string;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("providers")
      .select("id, mrf_index_url, mrf_location_name")
      .not("mrf_index_url", "is", null);
    if (state) query = query.eq("state", state);
    const { data, error } = await query.order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  let sample = rows;
  if (skipLoaded) {
    // Resume a state run that stopped partway: skip hospitals already on
    // crawled prices.
    const loaded = new Set<string>();
    for (const row of rows) {
      const { data, error } = await supabase
        .from("charges")
        .select("id")
        .eq("provider_id", row.id)
        .eq("source", "cms_mrf")
        .limit(1);
      if (error) throw error;
      if (data.length > 0) loaded.add(row.id);
    }
    sample = rows.filter((r) => !loaded.has(r.id));
    console.log(`${loaded.size} providers already loaded, skipped`);
  }
  if (state) {
    console.log(`${rows.length} providers in ${state} with a price-file list`);
  } else {
    const step = Math.max(1, rows.length / count);
    sample = Array.from(
      { length: Math.min(count, rows.length) },
      (_, i) => rows[Math.floor(i * step)]
    );
    console.log(`Sampling ${sample.length} of ${rows.length} providers`);
  }

  const entriesByIndex = new Map<string, HptTxtEntry[] | null>();
  const targets: Target[] = [];
  for (const row of sample) {
    if (!entriesByIndex.has(row.mrf_index_url)) {
      try {
        const { entries } = await discoverMrfs(row.mrf_index_url);
        entriesByIndex.set(row.mrf_index_url, entries);
      } catch (err) {
        console.log(`${row.mrf_index_url}: discovery failed — ${err}`);
        entriesByIndex.set(row.mrf_index_url, null);
      }
    }
    const entry = entriesByIndex
      .get(row.mrf_index_url)
      ?.find((e) => e.locationName === row.mrf_location_name);
    if (!entry) {
      console.log(`${row.mrf_location_name}: no longer listed, skipped`);
      continue;
    }
    const shared = targets.find((t) => t.mrfUrl === entry.mrfUrl);
    if (shared) {
      shared.alsoProviderIds = [...(shared.alsoProviderIds ?? []), row.id];
      continue;
    }
    targets.push({
      domain: new URL(row.mrf_index_url).hostname,
      locationName: entry.locationName,
      mrfUrl: entry.mrfUrl,
      providerId: row.id,
    });
  }
  return targets;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const codeSet = config.codesFile
    ? buildCodeSet(JSON.parse(readFileSync(config.codesFile, "utf8")))
    : loadDefaultCodeSet(REPO_ROOT);
  console.log(
    `Code set: ${codeSet.procedures.size} CPT/HCPCS, ${codeSet.drgs.size} MS-DRGs`
  );

  let supabase: SupabaseClient | null = null;
  if (config.compare) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "--compare needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    // Selects only, unless --load.
    supabase = createClient(url, key, { auth: { persistSession: false } });
  }

  const targets: Target[] = config.mrfUrls.map((mrfUrl) => ({
    domain: null,
    locationName: null,
    mrfUrl,
  }));
  const discovery: {
    domain: string;
    ok: boolean;
    entries: number;
    error?: string;
  }[] = [];
  for (const domain of config.domains) {
    try {
      const { url, entries } = await discoverMrfs(domain);
      const wanted = entries
        .filter(
          (e) =>
            !config.location ||
            e.locationName.toLowerCase().includes(config.location.toLowerCase())
        )
        .filter(
          (e, i, all) => all.findIndex((x) => x.mrfUrl === e.mrfUrl) === i
        )
        .slice(0, config.maxFiles);
      console.log(
        `${url}: ${entries.length} entries, crawling ${wanted.length}`
      );
      discovery.push({ domain, ok: true, entries: entries.length });
      targets.push(
        ...wanted.map((e) => ({
          domain,
          locationName: e.locationName || null,
          mrfUrl: e.mrfUrl,
        }))
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.log(`${domain}: discovery failed — ${error}`);
      discovery.push({ domain, ok: false, entries: 0, error });
    }
  }

  if (config.providers > 0 || config.state) {
    targets.push(
      ...(await providerTargets(
        supabase!,
        config.providers,
        config.state,
        config.skipLoaded
      ))
    );
  }

  const outPath =
    config.out ??
    join(
      config.cacheDir,
      `crawl-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`
    );
  // Each file's result is appended as it finishes, so --resume can pick up
  // a run the machine killed partway without crawling those files again.
  const progressPath = outPath.replace(/\.ndjson$/, "") + ".progress.jsonl";
  const results: FileResult[] =
    config.resume && existsSync(progressPath)
      ? readFileSync(progressPath, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as FileResult)
      : [];
  if (!config.resume) writeFileSync(progressPath, "");
  const done = new Set(results.map((r) => r.mrfUrl));
  if (done.size > 0) console.log(`resuming: ${done.size} files already done`);
  const out = createWriteStream(outPath, { flags: config.resume ? "a" : "w" });
  for (const target of targets) {
    if (done.has(target.mrfUrl)) continue;
    console.log(
      `\n${target.locationName ?? target.mrfUrl}\n  ${target.mrfUrl}`
    );
    const result = await crawlFile(target, config, codeSet, out, supabase);
    printResult(result);
    results.push(result);
    appendFileSync(progressPath, JSON.stringify(result) + "\n");
  }
  await new Promise<void>((r) => out.end(r));

  const summaryPath = outPath.replace(/\.ndjson$/, "") + ".summary.json";
  writeFileSync(summaryPath, JSON.stringify({ discovery, results }, null, 2));
  const ok = results.filter((r) => r.ok);
  console.log(
    `\n${ok.length}/${results.length} files parsed, ` +
      `${ok.reduce((s, r) => s + (r.rows ?? 0), 0).toLocaleString()} rows → ${outPath}\n` +
      `summary → ${summaryPath}`
  );
  if (config.state) {
    const loads = results.flatMap((r) => r.loads ?? []);
    const tally = new Map<string, number>();
    for (const l of loads) {
      const key = l.loaded ? "loaded" : l.error ? "error" : l.reason!;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    console.log(`\n${config.state} hospitals by outcome:`);
    for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]))
      console.log(`  ${n}  ${k}`);
    if (loads.some((l) => l.loaded)) {
      // Too slow for an API call; a nightly pg_cron job refreshes it.
      console.log(
        "typical prices per code (10x filter) refresh nightly at 04:00 UTC"
      );
    }
  }
}

if (process.argv[1]?.endsWith("crawl-mrf.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
