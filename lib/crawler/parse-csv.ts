// Stream-parse a CMS template CSV MRF (v2.x / v3.0), "tall" or "wide".
//
//   row 1: general headers (hospital_name, last_updated_on, version, ...)
//   row 2: their values
//   row 3: column headers; data from row 4
//
// Tall: one row per item x payer/plan (payer_name, plan_name,
// standard_charge|negotiated_dollar, standard_charge|methodology).
// Wide: one row per item; each payer/plan has its own columns,
// standard_charge|<payer>|<plan>|negotiated_dollar, ...|methodology and
// median_amount|<payer>|<plan>.
//
// Rows are filtered by code before anything else is built, so memory only
// grows with the rows we keep (tall rows are grouped back into one charge).

import type { Readable } from "stream";
import { parse } from "csv-parse";

import { hasWantedCode, type CodeSet } from "./codes";
import { parseAmount } from "./normalize";
import type {
  MrfMeta,
  ParseStats,
  RawCharge,
  RawCode,
  RawPayerRate,
} from "./types";

const splitHeader = (h: string) => h.split("|").map((p) => p.trim());
const headerKey = (h: string) => splitHeader(h).join("|").toLowerCase();

const cell = (row: string[], i: number | undefined): string | null => {
  if (i === undefined) return null;
  const v = row[i]?.trim();
  return v ? v : null;
};

const pipeList = (v: string | null): string[] =>
  v
    ? v
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

/** Read the two general-data rows at the top of the file. */
function csvMeta(headers: string[], values: string[]): MrfMeta {
  const meta: MrfMeta = {
    hospitalName: null,
    lastUpdatedOn: null,
    version: null,
    locationNames: [],
    addresses: [],
    licenseState: null,
  };
  headers.forEach((h, i) => {
    const key = headerKey(h);
    const value = cell(values, i);
    if (key === "hospital_name") meta.hospitalName = value;
    else if (key === "last_updated_on") meta.lastUpdatedOn = value;
    else if (key === "version") meta.version = value;
    else if (key === "location_name") meta.locationNames = pipeList(value);
    else if (key === "hospital_address") meta.addresses = pipeList(value);
    else if (key.startsWith("license_number|")) {
      meta.licenseState = splitHeader(h)[1]?.toUpperCase() || null;
    }
  });
  return meta;
}

interface Columns {
  index: Map<string, number>;
  codes: { code: number; type: number }[];
  /** Wide only: payer/plan → its dollar and methodology columns. */
  widePayers: {
    payerName: string;
    planName: string;
    dollar?: number;
    methodology?: number;
    medianAllowed?: number;
  }[];
  tall: boolean;
}

function csvColumns(headers: string[]): Columns {
  const index = new Map<string, number>();
  const codeCols = new Map<string, { code?: number; type?: number }>();
  const payers = new Map<string, Columns["widePayers"][number]>();
  const payer = (payerName: string, planName: string) => {
    const id = `${payerName}|${planName}`;
    const entry = payers.get(id) ?? { payerName, planName };
    payers.set(id, entry);
    return entry;
  };

  headers.forEach((h, i) => {
    const key = headerKey(h);
    if (!index.has(key)) index.set(key, i);
    const parts = splitHeader(h);
    const head = parts[0].toLowerCase();
    const tail = parts[parts.length - 1].toLowerCase();

    if (head === "code" && /^\d+$/.test(parts[1] ?? "")) {
      const entry = codeCols.get(parts[1]) ?? {};
      if (parts.length === 2) entry.code = i;
      else if (tail === "type") entry.type = i;
      codeCols.set(parts[1], entry);
    } else if (
      head === "standard_charge" &&
      parts.length >= 4 &&
      (tail === "negotiated_dollar" || tail === "methodology")
    ) {
      const entry = payer(parts[1], parts.slice(2, -1).join("|"));
      if (tail === "negotiated_dollar") entry.dollar = i;
      else entry.methodology = i;
    } else if (head === "median_amount" && parts.length >= 3) {
      payer(parts[1], parts.slice(2).join("|")).medianAllowed = i;
    }
  });

  const codes = [...codeCols.values()]
    .filter((c) => c.code !== undefined && c.type !== undefined)
    .map((c) => ({ code: c.code!, type: c.type! }));
  return {
    index,
    codes,
    widePayers: [...payers.values()],
    tall: index.has("payer_name"),
  };
}

function rowCodes(row: string[], cols: Columns): RawCode[] {
  const codes: RawCode[] = [];
  for (const c of cols.codes) {
    const code = cell(row, c.code);
    const type = cell(row, c.type);
    if (code && type) codes.push({ code, type });
  }
  return codes;
}

function rowCharge(row: string[], cols: Columns, codes: RawCode[]): RawCharge {
  const col = (k: string) => cell(row, cols.index.get(k));
  return {
    description: col("description"),
    codes,
    setting: col("setting"),
    billingClass: col("billing_class"),
    modifiers: pipeList(col("modifiers")).join(",") || null,
    gross: parseAmount(col("standard_charge|gross")),
    cash: parseAmount(col("standard_charge|discounted_cash")),
    min: parseAmount(col("standard_charge|min")),
    max: parseAmount(col("standard_charge|max")),
    payers: [],
  };
}

function tallPayer(row: string[], cols: Columns): RawPayerRate | null {
  const col = (k: string) => cell(row, cols.index.get(k));
  const rate: RawPayerRate = {
    payerName: col("payer_name"),
    planName: col("plan_name"),
    dollar: parseAmount(col("standard_charge|negotiated_dollar")),
    methodology: col("standard_charge|methodology"),
    medianAllowed: parseAmount(col("median_amount")),
  };
  return rate.payerName || rate.dollar !== null || rate.medianAllowed !== null
    ? rate
    : null;
}

function widePayers(row: string[], cols: Columns): RawPayerRate[] {
  const rates: RawPayerRate[] = [];
  for (const p of cols.widePayers) {
    const dollar = parseAmount(cell(row, p.dollar));
    const methodology = cell(row, p.methodology);
    const medianAllowed = parseAmount(cell(row, p.medianAllowed));
    if (dollar === null && methodology === null && medianAllowed === null) {
      continue;
    }
    rates.push({
      payerName: p.payerName,
      planName: p.planName,
      dollar,
      methodology,
      medianAllowed,
    });
  }
  return rates;
}

const lowest = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);
const highest = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

/**
 * Yield the standard charges that carry a wanted code. `meta` is filled from
 * the header rows before the first charge is yielded.
 */
export async function* parseCsvMrf(
  input: Readable,
  codeSet: CodeSet,
  meta: MrfMeta,
  stats: ParseStats
): AsyncGenerator<RawCharge> {
  const rows = parse({
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  });
  input.on("error", (err) => rows.destroy(err));
  input.pipe(rows);

  let lineNo = 0;
  let metaHeaders: string[] = [];
  let cols: Columns | null = null;
  const grouped = new Map<string, RawCharge>();

  for await (const row of rows as AsyncIterable<string[]>) {
    lineNo++;
    if (lineNo === 1) {
      metaHeaders = row;
      continue;
    }
    if (lineNo === 2) {
      Object.assign(meta, csvMeta(metaHeaders, row));
      continue;
    }
    if (lineNo === 3) {
      cols = csvColumns(row);
      if (cols.codes.length === 0 || !cols.index.has("description")) {
        throw new Error(
          "CSV is not in the CMS template layout (no code|N / description headers on row 3)"
        );
      }
      stats.csvLayout = cols.tall ? "tall" : "wide";
      continue;
    }

    stats.scanned++;
    const codes = rowCodes(row, cols!);
    if (!hasWantedCode(codes, codeSet)) continue;
    stats.matched++;

    const charge = rowCharge(row, cols!, codes);
    if (!cols!.tall) {
      charge.payers = widePayers(row, cols!);
      yield charge;
      continue;
    }
    // Some files give each contract family its own min/max (Ascension splits
    // a knee MRI into a Medicare Advantage group and a commercial one). It is
    // still one item, so group without them and widen min/max to cover all.
    const key = JSON.stringify({
      ...charge,
      payers: undefined,
      min: undefined,
      max: undefined,
    });
    const existing = grouped.get(key);
    const target = existing ?? charge;
    if (!existing) grouped.set(key, charge);
    else {
      existing.min = lowest(existing.min, charge.min);
      existing.max = highest(existing.max, charge.max);
    }
    const payer = tallPayer(row, cols!);
    if (payer) target.payers.push(payer);
  }

  yield* grouped.values();
}
