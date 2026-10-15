// Quality check: compare crawled prices with what production holds for the
// same hospital (the Trilliant Oria baseline), per code and setting.

import { plausiblePrice } from "../cpt/price-sanity";
import { normalizeDrg } from "./codes";

export interface PriceRow {
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  setting: string | null;
  cash_price: number | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
}

/**
 * "proc:73721|outpatient", "ms_drg:470|inpatient". CPT and HCPCS share one
 * key because hospitals put the same code under either label. Setting is part
 * of the key: an inpatient line is priced differently from an outpatient one,
 * and production does not always carry both.
 */
function codeKey(row: PriceRow): string | null {
  const setting = row.setting?.trim().toLowerCase() || "unknown";
  if (row.ms_drg) {
    const drg = normalizeDrg(row.ms_drg);
    return drg ? `ms_drg:${drg}|${setting}` : null;
  }
  const code = (row.cpt ?? row.hcpcs)?.trim().toUpperCase();
  return code ? `proc:${code}|${setting}` : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface CodePrices {
  cash: number[];
  negotiated: number[];
  rows: number;
}

/**
 * Collect per-code price lists. Cash goes through the same placeholder filter
 * the results page uses (#184), so a $0.01 cash price doesn't count as a match.
 */
export function addRow(byCode: Map<string, CodePrices>, row: PriceRow): void {
  const key = codeKey(row);
  if (!key) return;
  const entry = byCode.get(key) ?? { cash: [], negotiated: [], rows: 0 };
  entry.rows++;
  const code = row.cpt ?? row.hcpcs ?? row.ms_drg;
  const cash = plausiblePrice(
    row.cash_price != null ? Number(row.cash_price) : null,
    code,
    row.min_negotiated_rate != null ? Number(row.min_negotiated_rate) : null
  );
  if (cash !== undefined) entry.cash.push(cash);
  const neg =
    row.avg_negotiated_rate != null ? Number(row.avg_negotiated_rate) : 0;
  if (neg > 0) entry.negotiated.push(neg);
  byCode.set(key, entry);
}

export interface Agreement {
  /** Code/setting keys with a median on both sides. */
  pairs: number;
  /** Share of pairs within 5% / 25% of production. */
  within5: number;
  within25: number;
  /** Median of |crawled - prod| / prod across pairs. */
  medianAbsPctDiff: number | null;
  worst: { code: string; crawled: number; prod: number; pctDiff: number }[];
}

function agreement(
  crawled: Map<string, CodePrices>,
  prod: Map<string, CodePrices>,
  field: "cash" | "negotiated"
): Agreement {
  const diffs: Agreement["worst"] = [];
  for (const [code, c] of crawled) {
    const p = prod.get(code);
    const cm = median(c[field]);
    const pm = p ? median(p[field]) : null;
    if (cm === null || pm === null || pm <= 0) continue;
    diffs.push({ code, crawled: cm, prod: pm, pctDiff: (cm - pm) / pm });
  }
  const abs = diffs.map((d) => Math.abs(d.pctDiff));
  const share = (limit: number) =>
    diffs.length ? abs.filter((a) => a <= limit).length / diffs.length : 0;
  return {
    pairs: diffs.length,
    within5: share(0.05),
    within25: share(0.25),
    medianAbsPctDiff: median(abs),
    worst: diffs
      .sort((a, b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff))
      .slice(0, 5),
  };
}

export interface Comparison {
  crawledCodes: number;
  prodCodes: number;
  sharedCodes: number;
  onlyCrawled: number;
  onlyProd: number;
  cash: Agreement;
  negotiated: Agreement;
}

export function compareCodePrices(
  crawled: Map<string, CodePrices>,
  prod: Map<string, CodePrices>
): Comparison {
  const shared = [...crawled.keys()].filter((k) => prod.has(k)).length;
  return {
    crawledCodes: crawled.size,
    prodCodes: prod.size,
    sharedCodes: shared,
    onlyCrawled: crawled.size - shared,
    onlyProd: prod.size - shared,
    cash: agreement(crawled, prod, "cash"),
    negotiated: agreement(crawled, prod, "negotiated"),
  };
}
