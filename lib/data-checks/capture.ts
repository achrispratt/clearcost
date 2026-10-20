import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLookupDiagnostics, lookupCharges } from "@/lib/cpt/lookup";
import { groupResultsByProvider } from "@/lib/cpt/group-results";
import { inpatientStayFor } from "@/lib/cpt/inpatient-stays";
import { getDisplayPrice } from "@/lib/format";
import { feeScope, summarizeAnswer } from "@/lib/results/summarize";
import { SEO_METROS, type SeoMetro } from "@/lib/seo/metros";
import { SEO_PAGE_INDEX } from "@/lib/seo/page-index";
import { SEO_PROCEDURES } from "@/lib/seo/procedures";
import { SEO_RADIUS_MILES } from "@/lib/seo/prices";
import type { BillingCodeType, BodySite, CPTCode } from "@/types";
import {
  SNAPSHOT_VERSION,
  type CodeCoverage,
  type HospitalPrice,
  type ProviderFingerprint,
  type SearchSnapshot,
  type Snapshot,
} from "./types";

// ============================================================================
// Takes a snapshot for scripts/data-check.ts. Searches run through the same
// lookup, price filters and summary the app uses, read-only.
// ============================================================================

interface CheckSearch {
  slug: string;
  codeType: BillingCodeType;
  codes: string[];
  /** Codes the summary sees (a stay is summarized from its surgery code). */
  summaryCodes: CPTCode[];
  bodySite?: BodySite;
}

/**
 * Hospital stays the city pages don't cover, searched by their MS-DRGs and
 * priced the way the results page prices a stay.
 */
const STAY_CPTS: Array<[string, string]> = [
  ["heart-bypass-stay", "33533"],
  ["heart-valve-stay", "33405"],
  ["kidney-transplant-stay", "50360"],
];

/** Every procedure with a city page, plus the stays above. */
export function checkSearches(): CheckSearch[] {
  const procedures: CheckSearch[] = SEO_PROCEDURES.map((p) => ({
    slug: p.slug,
    codeType: p.codeType,
    codes: [p.code],
    summaryCodes: [
      {
        code: p.code,
        codeType: p.codeType,
        description: p.name,
        category: p.category,
      },
    ],
    bodySite: p.bodySite,
  }));
  const stays: CheckSearch[] = STAY_CPTS.map(([slug, cpt]) => {
    const summaryCodes: CPTCode[] = [
      { code: cpt, codeType: "cpt", description: slug, category: "Surgery" },
    ];
    const stay = inpatientStayFor(summaryCodes);
    if (!stay) throw new Error(`${cpt} is not an inpatient stay`);
    return { slug, codeType: "ms_drg", codes: stay.drgs, summaryCodes };
  });
  return [...procedures, ...stays];
}

async function runSearch(
  supabase: SupabaseClient,
  search: CheckSearch,
  metro: SeoMetro
): Promise<SearchSnapshot> {
  const diagnostics = createLookupDiagnostics();
  const raw = await lookupCharges(
    {
      codes: search.codes,
      codeType: search.codeType,
      lat: metro.lat,
      lng: metro.lng,
      radiusMiles: SEO_RADIUS_MILES,
      bodySite: search.bodySite,
    },
    { supabase, stage: "data-check", diagnostics }
  );
  // A failed lookup would read as every hospital losing its price.
  if (diagnostics.totalFailures > 0 || diagnostics.totalTimeouts > 0) {
    throw new Error(`lookup failed for ${search.slug} near ${metro.slug}`);
  }
  const results = groupResultsByProvider(raw);
  const summary = summarizeAnswer(results, search.summaryCodes);

  // One price per hospital: its cheapest line among those setting the answer,
  // else its cheapest cash or insured line, else its list price.
  const hospitals = new Map<string, HospitalPrice>();
  const rowIds = new Map<string, string>();
  const headline = new Set(
    summary.priced
      .filter((e) => summary.state !== "priced" || e.scope !== "professional")
      .flatMap((e) => e.locations.map((l) => l.id))
  );
  // A stay is priced only from the lines that set its answer.
  const stayRows = summary.stayDrg ? headline : null;
  const rank = (id: string, type: string) =>
    headline.has(id) ? 0 : type !== "gross" ? 1 : 2;
  for (const r of results) {
    if (stayRows && !stayRows.has(r.id)) continue;
    const price = getDisplayPrice(r);
    if (price.amount == null || price.type === "unavailable") continue;
    const current = hospitals.get(r.provider.id);
    if (current) {
      const now = rank(rowIds.get(r.provider.id)!, current.type);
      const next = rank(r.id, price.type);
      if (next > now || (next === now && price.amount >= current.amount)) {
        continue;
      }
    }
    rowIds.set(r.provider.id, r.id);
    hospitals.set(r.provider.id, {
      id: r.provider.id,
      name: r.provider.name,
      state: r.provider.state,
      amount: price.amount,
      type: price.type,
      scope: stayRows ? "facility" : feeScope(r.billingClass),
      source: r.source,
    });
  }

  return {
    key: `${search.slug}|${metro.slug}`,
    procedure: search.slug,
    metro: metro.slug,
    state: metro.state,
    answer: {
      state: summary.state,
      rangeCount: summary.rangeCount ?? 0,
      low: summary.low,
      median: summary.median,
      high: summary.high,
    },
    hospitals: [...hospitals.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

export async function captureSearches(
  supabase: SupabaseClient,
  metros: SeoMetro[],
  concurrency = 6,
  onProgress?: (done: number, total: number) => void
): Promise<SearchSnapshot[]> {
  const jobs = checkSearches().flatMap((search) =>
    metros.map((metro) => ({ search, metro }))
  );
  const total = jobs.length;
  const out: SearchSnapshot[] = [];
  let done = 0;
  async function worker() {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;
      out.push(
        await withRetry(() => runSearch(supabase, job.search, job.metro))
      );
      onProgress?.(++done, total);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

interface FingerprintRow {
  provider_id: string;
  code: string;
  rows: number;
  priced_rows: number;
  cash_min: number | null;
  cash_max: number | null;
  insured_min: number | null;
  insured_max: number | null;
  last_loaded: string | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** Per-code coverage for every hospital in the given states. */
export async function captureProviders(
  supabase: SupabaseClient,
  states: string[],
  concurrency = 4
): Promise<Record<string, ProviderFingerprint>> {
  const out: Record<string, ProviderFingerprint> = {};
  if (states.length === 0) return out;

  const providers: { id: string; name: string; state: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, state")
      .in(
        "state",
        states.map((s) => s.toUpperCase())
      )
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`providers: ${error.message}`);
    providers.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  for (const p of providers) {
    out[p.id] = {
      name: p.name,
      state: p.state ?? undefined,
      lastLoaded: null,
      codes: {},
    };
  }
  // One hospital per call: the API returns at most 1,000 rows per call and a
  // crawled hospital alone can have more codes, so each call is also paged.
  // Paging a multi-hospital call re-runs its whole aggregate per page.
  const queue = providers.map((p) => p.id);
  async function worker() {
    for (;;) {
      const id = queue.shift();
      if (!id) return;
      for (let from = 0; ; from += 1000) {
        const page = await withRetry(async () => {
          const { data, error } = await supabase
            .rpc("coverage_fingerprint", { p_provider_ids: [id] })
            .order("code")
            .range(from, from + 999);
          if (error) throw new Error(`coverage_fingerprint: ${error.message}`);
          return (data ?? []) as FingerprintRow[];
        });
        for (const r of page) {
          const p = out[r.provider_id];
          const coverage: CodeCoverage = [
            Number(r.rows),
            Number(r.priced_rows),
            num(r.cash_min),
            num(r.cash_max),
            num(r.insured_min),
            num(r.insured_max),
          ];
          p.codes[r.code] = coverage;
          if (
            r.last_loaded &&
            (!p.lastLoaded || r.last_loaded > p.lastLoaded)
          ) {
            p.lastLoaded = r.last_loaded;
          }
        }
        if (page.length < 1000) break;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/** Hash of the typical prices behind the price filters. */
export async function referenceHash(supabase: SupabaseClient): Promise<string> {
  const hash = createHash("sha256");
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("code_price_reference")
      .select("code, professional, typical_price")
      .order("code")
      .order("professional")
      .range(from, from + 999);
    if (error) throw new Error(`code_price_reference: ${error.message}`);
    for (const r of data ?? []) {
      hash.update(`${r.code}|${r.professional}|${r.typical_price}\n`);
    }
    if (!data || data.length < 1000) break;
  }
  return hash.digest("hex").slice(0, 16);
}

export async function takeSnapshot(
  supabase: SupabaseClient,
  options: {
    label: string;
    states: string[];
    onProgress?: (done: number, total: number) => void;
  }
): Promise<Snapshot> {
  const states = options.states.map((s) => s.toUpperCase());
  const takenAt = new Date().toISOString();
  const [reference, searches, providers] = await Promise.all([
    referenceHash(supabase),
    // Every metro, not only the load's states: outside them nothing should move.
    captureSearches(supabase, SEO_METROS, 6, options.onProgress),
    captureProviders(supabase, states),
  ]);
  return {
    version: SNAPSHOT_VERSION,
    label: options.label,
    takenAt,
    states,
    referenceHash: reference,
    nationalMedians: SEO_PAGE_INDEX.nationalMedians,
    searches,
    providers,
  };
}
