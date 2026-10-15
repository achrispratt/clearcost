// Map a standard charge read from a hospital file to the `charges` row shape
// the Trilliant import writes (lib/data/import-trilliant.ts), so a later
// loader can insert crawled rows next to imported ones.

import {
  normalizeBillingClass,
  normalizeSetting,
} from "../data/normalize-charge";
import { parseBodySite } from "../cpt/parse-body-site";
import { parseLaterality } from "../cpt/parse-laterality";
import { classifyCode, type CodeSet } from "./codes";
import { median } from "./compare";
import type { CrawledCharge, MrfMeta, RawCharge, RawPayerRate } from "./types";
// Per-diem rates are daily, not the price of a stay; same rule as the import (#185).
import { EXCLUDED_STAY_METHODOLOGIES } from "../data/charge-select";

/** "Per_Diem", "per-diem", " PER DIEM " → "per diem". */
export function normalizeMethodology(value: string | null): string | null {
  const v = value
    ?.toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return v || null;
}

/** Parse a price cell: numbers pass through, "$1,234.50" → 1234.5, junk → null. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface NegotiatedStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number | null;
  perDiemExcluded: number;
}

/**
 * Negotiated min/avg/max and payer_count from payer dollar rates. Rates must
 * be positive. For a DRG (a hospital stay) per-diem rates are left out; if
 * none remain the stats are null so the app says it can't price the stay.
 */
export function negotiatedStats(
  payers: RawPayerRate[],
  isDrg: boolean
): NegotiatedStats {
  const rates: number[] = [];
  let perDiemExcluded = 0;
  for (const p of payers) {
    if (p.dollar == null || !(p.dollar > 0)) continue;
    const method = normalizeMethodology(p.methodology);
    if (isDrg && method && EXCLUDED_STAY_METHODOLOGIES.includes(method)) {
      perDiemExcluded++;
      continue;
    }
    rates.push(p.dollar);
  }
  if (rates.length === 0) {
    return { avg: null, min: null, max: null, count: null, perDiemExcluded };
  }
  return {
    avg: round2(rates.reduce((s, r) => s + r, 0) / rates.length),
    min: round2(Math.min(...rates)),
    max: round2(Math.max(...rates)),
    count: rates.length,
    perDiemExcluded,
  };
}

/** Median of the payers' positive v3.0 median allowed amounts. */
function allowedAmountMedian(payers: RawPayerRate[]): number | null {
  const m = median(
    payers
      .map((p) => p.medianAllowed)
      .filter((v): v is number => v !== null && v > 0)
  );
  return m === null ? null : round2(m);
}

const firstCodeOfType = (raw: RawCharge, type: string): string | null =>
  raw.codes.find((c) => c.type.trim().toUpperCase() === type)?.code.trim() ||
  null;

/**
 * The charges row for a standard charge, or null when none of its codes is in
 * the code set. Prices are kept as published, like the import: placeholder
 * prices (#184) are filtered when results are shown (lib/cpt/price-sanity.ts).
 */
export function toCrawledCharge(
  raw: RawCharge,
  codeSet: CodeSet,
  source: { mrfUrl: string; meta: MrfMeta }
): CrawledCharge | null {
  const columns: Record<"cpt" | "hcpcs" | "ms_drg", string | null> = {
    cpt: null,
    hcpcs: null,
    ms_drg: null,
  };
  for (const c of raw.codes) {
    const hit = classifyCode(c, codeSet);
    if (hit && !columns[hit.column]) columns[hit.column] = hit.code;
  }
  if (!columns.cpt && !columns.hcpcs && !columns.ms_drg) return null;

  const stats = negotiatedStats(raw.payers, columns.ms_drg !== null);
  return {
    description: raw.description?.trim() || null,
    setting: normalizeSetting(raw.setting),
    billing_class: normalizeBillingClass(raw.billingClass),
    ...columns,
    revenue_code: firstCodeOfType(raw, "RC"),
    ndc: firstCodeOfType(raw, "NDC"),
    icd: firstCodeOfType(raw, "ICD"),
    modifiers: raw.modifiers,
    laterality: parseLaterality(raw.description, raw.modifiers),
    body_site: parseBodySite(raw.description),
    gross_charge: raw.gross,
    cash_price: raw.cash,
    min_price: raw.min,
    max_price: raw.max,
    avg_negotiated_rate: stats.avg,
    min_negotiated_rate: stats.min,
    max_negotiated_rate: stats.max,
    payer_count: stats.count,
    source: "cms_mrf",
    allowed_amount_median: allowedAmountMedian(raw.payers),
    per_diem_rates_excluded: stats.perDiemExcluded,
    mrf_url: source.mrfUrl,
    mrf_hospital_name: source.meta.hospitalName,
    mrf_last_updated_on: source.meta.lastUpdatedOn,
  };
}
