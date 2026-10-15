// Shapes the MRF crawler passes between its stages. They stay in lib/crawler
// because only the crawler CLI uses them; the app never sees crawled rows
// until a loader writes them into `charges`.

/** File-level metadata from the CMS template header (JSON root / CSV rows 1-2). */
export interface MrfMeta {
  hospitalName: string | null;
  lastUpdatedOn: string | null;
  version: string | null;
  locationNames: string[];
  addresses: string[];
  licenseState: string | null;
}

export interface RawPayerRate {
  payerName: string | null;
  planName: string | null;
  dollar: number | null;
  methodology: string | null;
  /** v3.0: median of the allowed amounts the hospital actually received. */
  medianAllowed: number | null;
}

export interface RawCode {
  code: string;
  type: string;
}

/**
 * One standard charge as the file states it: a JSON standard_charges[] entry,
 * a wide-CSV row, or the tall-CSV rows that share item, setting and prices.
 */
export interface RawCharge {
  description: string | null;
  codes: RawCode[];
  setting: string | null;
  billingClass: string | null;
  modifiers: string | null;
  gross: number | null;
  cash: number | null;
  min: number | null;
  max: number | null;
  payers: RawPayerRate[];
}

/**
 * A crawled row in the `charges` column shape (minus provider_id, which a
 * loader resolves), plus provenance so it can be traced back to its file.
 */
export interface CrawledCharge {
  description: string | null;
  setting: string | null;
  billing_class: string | null;
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  revenue_code: string | null;
  ndc: string | null;
  icd: string | null;
  modifiers: string | null;
  laterality: string | null;
  body_site: string | null;
  gross_charge: number | null;
  cash_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
  max_negotiated_rate: number | null;
  payer_count: number | null;
  source: "cms_mrf";
  /**
   * Median across payers of the v3.0 "median allowed amount" (what payers
   * historically paid). Not a charges column yet; kept because stays priced
   * by formula (case rate x DRG weight) often have no dollar rate at all.
   */
  allowed_amount_median: number | null;
  /** Payer rates left out of the stats because they are per diem (DRG rows). */
  per_diem_rates_excluded: number;
  mrf_url: string;
  mrf_hospital_name: string | null;
  mrf_last_updated_on: string | null;
}

export interface ParseStats {
  /** Items (JSON) or data rows (CSV) read from the file. */
  scanned: number;
  /** Of those, how many carried a wanted code. */
  matched: number;
  /** CSV only: which CMS layout the file uses. */
  csvLayout?: "tall" | "wide";
}
