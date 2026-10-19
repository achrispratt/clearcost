// Loading crawled rows into production (#25): the checks a file must pass
// before its prices replace a hospital's older ones, and the write itself.
// The swap runs in Postgres (apply_mrf_load, migration
// 20261018120000_mrf_load_swap.sql) so a hospital never shows two prices for
// one code or none at all mid-load.

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Comparison } from "./compare";
import type { CrawledCharge, MrfMeta } from "./types";

/** Pairs needed before agreement with production can veto a file. */
export const MIN_PAIRS_TO_JUDGE = 20;
/** Below this share of prices within 25% of production, the file is suspect. */
export const MIN_WITHIN_25 = 0.25;

export interface LoadCheckInput {
  rows: number;
  meta: MrfMeta;
  providerState: string | null;
  /** The hospital's name and its location name in the price-file list. */
  providerNames: string[];
  /** Date of the Oria file behind the hospital's current rows. */
  providerLastUpdated: string | null;
  comparison: Comparison | null;
}

export type LoadDecision = { load: true } | { load: false; reason: string };

/**
 * Whether a crawled file may replace the hospital's current prices. A wrong
 * price is worse than an old one, so anything doubtful keeps what is live.
 */
export function loadDecision(input: LoadCheckInput): LoadDecision {
  const {
    rows,
    meta,
    providerState,
    providerNames,
    providerLastUpdated,
    comparison,
  } = input;
  if (rows === 0) return { load: false, reason: "no rows for our codes" };
  if (
    meta.licenseState &&
    providerState &&
    meta.licenseState.toUpperCase() !== providerState.toUpperCase()
  ) {
    return {
      load: false,
      reason: `file is licensed in ${meta.licenseState}, hospital is in ${providerState}`,
    };
  }
  const fileDate = parseDate(meta.lastUpdatedOn);
  const liveDate = parseDate(providerLastUpdated);
  if (!fileDate)
    return { load: false, reason: "file has no last-updated date" };
  if (liveDate && fileDate < liveDate) {
    return {
      load: false,
      reason: `file (${meta.lastUpdatedOn}) is older than live data (${providerLastUpdated})`,
    };
  }
  const judged = comparison
    ? [comparison.cash, comparison.negotiated].filter(
        (a) => a.pairs >= MIN_PAIRS_TO_JUDGE
      )
    : [];
  if (judged.length > 0 && judged.every((a) => a.within25 < MIN_WITHIN_25)) {
    return {
      load: false,
      reason:
        "prices disagree with live data on most shared codes (wrong file?)",
    };
  }
  // With no live prices to compare against, the file's own name is the only
  // check that it belongs to this hospital.
  const fileNames = [meta.hospitalName, ...meta.locationNames].filter(
    (n): n is string => !!n
  );
  if (
    judged.length === 0 &&
    fileNames.length > 0 &&
    !namesOverlap(fileNames, providerNames)
  ) {
    return {
      load: false,
      reason: `file is for "${fileNames[0]}" and there are no live prices to check it against`,
    };
  }
  return { load: true };
}

const GENERIC_NAME_WORDS = new Set([
  "and",
  "the",
  "of",
  "at",
  "inc",
  "llc",
  "hospital",
  "hospitals",
  "medical",
  "center",
  "centre",
  "health",
  "healthcare",
  "care",
  "community",
  "regional",
  "memorial",
  "general",
  "services",
  "service",
  "system",
  "systems",
  "clinic",
  "clinics",
  "district",
  "county",
  "public",
  "saint",
  "campus",
  "family",
  "medicine",
  "rural",
]);

function nameWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/\bst\.?\s/g, "saint ")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !GENERIC_NAME_WORDS.has(w))
  );
}

/** Whether any distinctive word (not "hospital", "medical"...) is shared. */
export function namesOverlap(a: string[], b: string[]): boolean {
  const words = new Set(a.flatMap((n) => [...nameWords(n)]));
  return b.some((n) => [...nameWords(n)].some((w) => words.has(w)));
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A crawled row as a charges_mrf_staging row. */
export function toStagingRow(
  row: CrawledCharge,
  providerId: string,
  loadId: string
): Record<string, unknown> {
  return {
    load_id: loadId,
    provider_id: providerId,
    description: row.description,
    setting: row.setting,
    billing_class: row.billing_class,
    cpt: row.cpt,
    hcpcs: row.hcpcs,
    ms_drg: row.ms_drg,
    revenue_code: row.revenue_code,
    ndc: row.ndc,
    icd: row.icd,
    modifiers: row.modifiers,
    laterality: row.laterality,
    body_site: row.body_site,
    gross_charge: row.gross_charge,
    cash_price: row.cash_price,
    min_price: row.min_price,
    max_price: row.max_price,
    avg_negotiated_rate: row.avg_negotiated_rate,
    min_negotiated_rate: row.min_negotiated_rate,
    max_negotiated_rate: row.max_negotiated_rate,
    payer_count: row.payer_count ?? 0,
    source: "cms_mrf",
    last_updated: parseDate(row.mrf_last_updated_on)?.toISOString() ?? null,
  };
}

const PRICE_FIELDS = [
  "gross_charge",
  "cash_price",
  "min_price",
  "max_price",
  "avg_negotiated_rate",
  "min_negotiated_rate",
  "max_negotiated_rate",
] as const;

/** What makes two rows show different prices; everything else is labeling. */
const PRICE_KEY_FIELDS = [
  "cpt",
  "hcpcs",
  "ms_drg",
  "setting",
  "billing_class",
  "modifiers",
  "laterality",
  "body_site",
  ...PRICE_FIELDS,
] as const;

/**
 * Staging rows worth storing. Price files list the same code at the same
 * prices many times over (once per revenue code, drug package or
 * chargemaster wording); one row per distinct price is all search reads,
 * and keeps a crawled hospital about the size of its Trilliant rows. Rows
 * with no price at all show nothing and are dropped.
 */
export function storableRows(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (PRICE_FIELDS.every((f) => row[f] == null)) return false;
    const key = JSON.stringify(PRICE_KEY_FIELDS.map((f) => row[f] ?? null));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LoadResult {
  inserted: number;
  archived: number;
  replaced: number;
}

/** Stage one hospital's rows, then swap them in with apply_mrf_load. */
export async function loadProviderRows(
  supabase: SupabaseClient,
  providerId: string,
  rows: CrawledCharge[]
): Promise<LoadResult> {
  const loadId = randomUUID();
  const staged = storableRows(
    rows.map((r) => toStagingRow(r, providerId, loadId))
  );
  for (let i = 0; i < staged.length; i += 500) {
    const { error } = await supabase
      .from("charges_mrf_staging")
      .insert(staged.slice(i, i + 500));
    if (error) {
      await supabase.from("charges_mrf_staging").delete().eq("load_id", loadId);
      throw new Error(`staging failed: ${error.message}`);
    }
  }
  const { data, error } = await supabase.rpc("apply_mrf_load", {
    p_provider_id: providerId,
    p_load_id: loadId,
  });
  if (error) {
    await supabase.from("charges_mrf_staging").delete().eq("load_id", loadId);
    throw new Error(`apply_mrf_load failed: ${error.message}`);
  }
  return data as LoadResult;
}
