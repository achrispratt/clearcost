# MRF Crawler (first slice)

> **Owner:** Engineering · **Issue:** #25 (Independent MRF crawler, Phase 6) · **Status:** first slice, local output only
> **Update when:** `lib/crawler/` or `scripts/crawl-mrf.ts` changes

Reads hospital price files straight from each hospital's website, so prices no longer depend on the Trilliant Oria bulk download (which needs the owner's login). This slice discovers, downloads, parses and normalizes files end to end and checks them against production, but **writes nothing to the database**: rows go to a local NDJSON file.

## Usage

```
# Discover through cms-hpt.txt, crawl every listed file, compare with prod (read-only)
npx tsx --env-file=.env.local scripts/crawl-mrf.ts --domain www.ohsu.edu --compare

# One location of a multi-hospital system
npx tsx --env-file=.env.local scripts/crawl-mrf.ts \
  --domain www.houstonmethodist.org --location "Houston Methodist Hospital" --max-files 1 --compare

# A known file, no discovery, no prod access needed
npx tsx scripts/crawl-mrf.ts --mrf-url https://example.org/123456789_example_standardcharges.json
```

| Option                  | Purpose                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `--domain <host>`       | Website whose `/cms-hpt.txt` lists the files (repeatable)                                        |
| `--domains-file <json>` | JSON array of hosts                                                                              |
| `--mrf-url <url>`       | Skip discovery, crawl this file (repeatable)                                                     |
| `--location <text>`     | Only `cms-hpt.txt` entries whose location-name contains this text                                |
| `--max-files <n>`       | At most n files per domain (`0` = discovery only)                                                |
| `--codes <json>`        | Code list to keep instead of the default set                                                     |
| `--out <file>`          | NDJSON output (default `<cache-dir>/crawl-<time>.ndjson`)                                        |
| `--cache-dir <dir>`     | Download cache, outside the repo (default `<os tmp>/clearcost-mrf`)                              |
| `--max-mb <n>`          | Refuse files larger than this (default 4000)                                                     |
| `--refresh`             | Re-download files already in the cache                                                           |
| `--compare`             | Match each file to a provider and compare prices with prod (`select` only)                       |
| `--provider-id <uuid>`  | Provider to compare against instead of matching by name                                          |
| `--providers <n>`       | Crawl an evenly spread sample of n providers with a stored `mrf_index_url` (implies `--compare`) |

Each run also writes `<out>.summary.json`: discovery results, per-file format, counts, the #173 DRG report and the comparison.

## Pipeline

```
cms-hpt.txt (lib/crawler/hpt-txt.ts)
  ↓ mrf-url per location
download to cache (lib/crawler/fetch.ts) — size cap, never executed
  ↓ sniff: gzip / zip (first .json/.csv entry, fflate) / plain; drop UTF-8 BOM
parse, streaming
  JSON  (lib/crawler/parse-json.ts) — stream-json tokens; only header fields and one
        standard_charge_information item at a time are assembled
  CSV   (lib/crawler/parse-csv.ts)  — csv-parse; tall or wide detected from row-3 headers
  ↓ keep items with a wanted code (filter happens before payer data is built)
normalize (lib/crawler/normalize.ts) → charges-shaped row
  ↓
NDJSON + summary; --compare (lib/crawler/compare.ts, provider match in the script)
```

Memory stays flat: ~120-130 MB RSS on 437-500 MB files. The script aborts if RSS passes 1.5 GB.

### Discovery and hospital domains

45 CFR 180.50(d)(6) requires a `cms-hpt.txt` at the root of the website hosting the MRF, with `location-name`, `source-page-url`, `mrf-url`, `contact-name`, `contact-email` per location. Real files add banners and free text, use CRLF, skip blank lines and repeat entries; the parser keys on known `key: value` lines and starts a new entry when a key repeats.

**Hospital websites** come from `scripts/build-hospital-websites.ts`, which matches four public datasets to our providers (DoltHub `transparency-in-pricing` and `hospital-price-transparency-v3`, both keyed by CMS Certification Number; DHS HIFLD Hospitals; Wikidata) and then reads each site's `cms-hpt.txt`. Matching is strict: keyed sources must agree on the CMS number plus ZIP or name; the others need the same street address or map spot plus a matching name, and no conflicting brand or facility type. A website no `cms-hpt.txt` confirms is kept only if it still loads. A hospital can also take its file list from a system site already confirmed for another hospital in its state, when exactly one such site lists the identical name. Results land in `providers.website`, `website_source`, `mrf_index_url` and `mrf_location_name` through a generated migration. First run (2026-10-15): 3,160 of 5,419 providers have a website, and 2,663 have a `cms-hpt.txt` entry naming them. Re-run it to refresh:

```
npx tsx --env-file=.env.local scripts/build-hospital-websites.ts   # writes supabase/migrations/<date>090000_provider_websites.sql
npx tsx --env-file=.env.local scripts/crawl-mrf.ts --providers 50  # crawl an evenly spread sample and compare with prod
```

### Formats

| Format                            | Handled                                                                                                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON v2.x / v3.0                  | `standard_charge_information[]` → `code_information[]`, `standard_charges[]` (setting, gross_charge, discounted_cash, minimum, maximum, billing_class, modifier_code, `payers_information[]`) |
| CSV tall v2.x / v3.0              | Rows 1-2 general data, row 3 headers. One row per item × payer/plan; rows are grouped back into one charge by item, codes, setting, billing class, modifiers and prices                       |
| CSV wide v2.x / v3.0              | Payer/plan columns `standard_charge\|<payer>\|<plan>\|negotiated_dollar`, `…\|methodology`, `median_amount\|<payer>\|<plan>`                                                                  |
| gzip, zip                         | Unpacked while streaming                                                                                                                                                                      |
| Pre-template (v1, custom layouts) | Rejected with an error ("not in the CMS template layout")                                                                                                                                     |

The file extension is ignored (Houston Methodist serves JSON as `.ashx`); JSON vs CSV comes from the first byte.

## Normalization (matches `lib/data/import-trilliant.ts`)

| Charges column                                         | From the file                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cpt`, `hcpcs`                                         | Code with type CPT / HCPCS, kept under the label the file used (as the import does). Only codes in the code set                                                    |
| `ms_drg`                                               | Type MS-DRG or DRG, zero-padded to 3 digits. APR-DRG and other groupers are skipped                                                                                |
| `revenue_code`, `ndc`, `icd`                           | First RC / NDC / ICD code on the item                                                                                                                              |
| `setting`, `billing_class`                             | `normalizeSetting` / `normalizeBillingClass` from `lib/data/normalize-charge.ts`                                                                                   |
| `laterality`, `body_site`                              | `parseLaterality` / `parseBodySite` from `lib/cpt/`                                                                                                                |
| `gross_charge`, `cash_price`, `min_price`, `max_price` | `gross_charge`, `discounted_cash`, `minimum`, `maximum` as published                                                                                               |
| `avg/min/max_negotiated_rate`, `payer_count`           | Mean/min/max/count of the payers' positive `standard_charge_dollar`. **DRG rows leave out per-diem rates** (#185); a stay with only per-diem rates gets null stats |
| `source`                                               | `cms_mrf`                                                                                                                                                          |

Extra fields (not charges columns): `allowed_amount_median` (median across payers of the v3.0 "median allowed amount"), `per_diem_rates_excluded`, `mrf_url`, `mrf_hospital_name`, `mrf_last_updated_on`.

**Default code set:** `lib/data/final-codes.json` + `lib/data/import-sets/inpatient-stay-drgs.json` + the #173 surgical/obstetric stay DRGs (`ISSUE_173_DRGS` in `lib/crawler/codes.ts`).

**Placeholder prices (#184)** are not filtered at import time in the existing pipeline: `lib/cpt/price-sanity.ts` drops them when results are shown. The crawler keeps prices as published for the same reason; `--compare` runs both sides through `plausiblePrice()`.

**Per diem (#185):** the per-diem rule lives in `lib/data/charge-select.ts` on the #185 branch, which is not merged into this slice's base. `EXCLUDED_STAY_METHODOLOGIES` is defined in `lib/crawler/normalize.ts` with the same value; once #185 merges, import it from there instead.

**Known difference from Oria:** Oria's pre-computed `avg_negotiated_rate` / `payer_count` follow an undocumented rule. On the same file (Advocate Christ, both dated 2025-11-04) cash prices match exactly but our negotiated average differs (e.g. payer_count 19 vs Oria's 18 for the same MRI line). Ours is the plain mean of every positive dollar rate.

## Quality check (`--compare`)

The file is matched to a production provider in the license state: name word overlap (the CMS star-rating matcher's `nameSimilarity` / `conflictingNames`), a shared ZIP lowers the bar, a different ZIP needs an exact name, ties are refused. Production rows for that provider are read (select only) and medians are compared per code **and setting** for cash (through `plausiblePrice`) and `avg_negotiated_rate`.

## Sample run (2026-10-15)

Seven hospitals, cached downloads, default code set (1,054 CPT/HCPCS + 59 MS-DRGs), `--compare` against production. 6 of 7 files parsed, 20,101 rows written. Peak RSS ~130 MB.

**Discovery:** `cms-hpt.txt` worked for OHSU (1 entry), Houston Methodist (20), UCLA Health (4), Advocate (11), UCHealth (15), NYU Langone (5) and Mass General Brigham (14, served gzip-encoded). Mount Sinai returns 403 to Node (Akamai). In an earlier `curl` probe, Mayo Clinic and Johns Hopkins returned 403, Cleveland Clinic 404 (no file at the root), Intermountain 522.

| Hospital                        | File                                | Size, parse time | Scanned   | Rows kept (cpt/hcpcs/drg) | vs prod: cash within 5% / 25% (median diff)              | vs prod: negotiated within 5% / 25% (median diff)                                         |
| ------------------------------- | ----------------------------------- | ---------------- | --------- | ------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| OHSU (OR)                       | CSV tall in zip, v3.0.0, 2026-03-23 | 13 MB, 28 s      | 976,657   | 6,751 (5,916/783/52)      | 27% / 80% (8%) — Oria file 2025-03-19                    | 49% / 87% (5%)                                                                            |
| Houston Methodist Hospital (TX) | JSON served as `.ashx`, BOM, v3.0.0 | 72 MB, 7 s       | 29,585    | 3,143 (0/3,025/118)       | 8% / 85% (10%) — Oria 2025-01-01                         | no pairs: prod has 0 negotiated rates here                                                |
| Ronald Reagan UCLA (CA)         | JSON, v3.0.0, 2026-03-29            | 500 MB, 34 s     | 20,203    | 961 (0/896/65)            | no cash in the file for these codes                      | 6% / 27% (502%): prod rows are $0.01-cash placeholders, e.g. 22558 $182 vs $51.6k crawled |
| Advocate Christ (IL)            | CSV tall, v3.0.0, 2025-11-04        | 148 MB, 38 s     | 526,194   | 3,027 (2,599/374/54)      | **100% / 100% (0%)** — same file date as Oria            | 60% / 100% (3%)                                                                           |
| UCHealth Univ. of Colorado (CO) | CSV tall, v3.0.0, 2025-11-01        | 437 MB, 116 s    | 1,683,101 | 4,905 (3,926/925/54)      | 34% / 63% (15%) — Oria file a year older                 | 11% / 50% (25%)                                                                           |
| NYU Langone Tisch (NY)          | CSV wide (3,194 columns), v3.0.0    | 482 MB, 35 s     | 12,382    | 1,314 (1,212/102/0)       | not compared: Tisch is not in prod (only NYU Suffolk is) | —                                                                                         |
| Mount Sinai Hospital (NY)       | JSON                                | —                | —         | —                         | HTTP 403 (Akamai)                                        | —                                                                                         |

Reading the comparison: where the crawled file and the Oria snapshot are the same file (Advocate), cash matches exactly and negotiated averages land within 25% everywhere (the gap is Oria's undocumented averaging). Where the files are a year apart (UCHealth, OHSU), much of the gap is likely real price changes. Prod also lacks the inpatient-setting rows for curated codes at these hospitals (at Advocate, 740 code/setting keys are only in the crawl; the lines checked by hand were inpatient).

**#173 stay DRGs** (34 listed: the issue's 24 plus the current spinal fusion DRGs):

| Hospital          | DRGs in file | With negotiated $ | Notes                                                                                                                                           |
| ----------------- | ------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Houston Methodist | 34/34        | 34                | e.g. 470 $28.9k, 621 $20.6k, 783 $26.2k, 807 $8.7k; v3 allowed amounts on 29                                                                    |
| UCLA              | 29/34        | 29                | 470 $35.0k, 621 $29.6k, 783 $34.6k, 807 $12.7k; per-diem rates excluded on 44 stay rows                                                         |
| Advocate Christ   | 29/34        | 29                | 470 $30.8k, 621 $23.3k, 783 $30.1k, 807 $10.9k                                                                                                  |
| UCHealth          | 29/34        | 29                | 470 $32.4k, 621 $24.6k, 783 $22.7k, 807 $9.2k                                                                                                   |
| OHSU              | 28/34        | 0                 | Stays priced by formula ("DRG 470 at Case Rate $28,750 × DRG Weight 1.9289"), no dollar field; v3 allowed-amount medians on all 28 (470 $18.5k) |
| NYU Langone Tisch | 0/34         | 0                 | No MS-DRG rows in the file                                                                                                                      |

The five missing everywhere except Houston are 453-455 and 459-460, the older spinal fusion DRGs; the current ones (402, 426-430, 447-448, 450-451) are present and priced. No crawled file had a cash price for any stay.

## Loading (not built)

No migration is needed: `charges` already has every column, and `source` distinguishes `cms_mrf` from `trilliant_oria`. A loader would:

1. Resolve `provider_id` per file (the `--compare` matcher, a `--provider-id` override, or a stored domain → provider mapping); create a provider row for hospitals Oria never had.
2. Per provider, `DELETE FROM charges WHERE provider_id = $1 AND source = 'cms_mrf'`, then insert the NDJSON rows minus the extra fields through the same pooler INSERT path as `flushOneBatch` in `import-trilliant.ts`.
3. Decide precedence when a provider has both `trilliant_oria` and `cms_mrf` rows (newest `mrf_last_updated_on` wins is the obvious rule; search currently reads every source).
4. Run `refresh_provider_cash_ratios(array[...])` for the loaded providers.

## Limits

- **Bot protection:** Akamai-fronted sites (Mount Sinai) return 403 to Node's `fetch` for both `cms-hpt.txt` and the MRF, while `curl` gets 200. Not worked around.
- **Speed:** JSON assembles every item to check its codes (10-15 MB/s); a 437 MB tall CSV takes ~2 minutes. Fine for a sample, slow for 6,000 hospitals on one machine.
- **Zip:** only the first `.json`/`.csv` entry is read.
- **Wide CSV:** a payer or plan name containing `|` is split at the first pipe.
- A file that fails partway leaves the rows it already wrote in the NDJSON; the summary marks it `ok: false`.
- No incremental refresh, retries, politeness delays or robots handling yet.

## Next steps

1. Websites for the remaining 2,259 providers (1,452 of them have no CMS number, so only the unkeyed sources can match them): another source, or the hospital's own file header once the loader exists.
2. Loader (above) behind a dry-run flag, one state at a time.
3. Incremental refresh keyed on `mrf_last_updated_on` / HTTP `Last-Modified`.
4. Decide whether to store v3.0 allowed amounts (new column), since formula-priced stays (OHSU) have no dollar rate.
5. #173: add the current spinal fusion DRGs (402, 426-430, 447-448, 450-451) to `inpatient-stay-drgs.json`; 453-455 and 459-460 are mostly gone from current files.
6. Bot-protected hosts: decide whether a different HTTP client is acceptable for sites that block Node.
