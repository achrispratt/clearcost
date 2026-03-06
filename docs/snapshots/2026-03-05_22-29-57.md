# ClearCost Data Snapshot

_Generated: 2026-03-05T22:29:57.808Z_

To regenerate after an import:

```bash
npx tsx --env-file=.env.local lib/data/generate-snapshot.ts
```

Each run creates a new file in `docs/snapshots/YYYY-MM-DD_HH-MM-SS.md` and updates `docs/data-snapshot.md` (latest).

## Executive Summary

| Metric                      |         Value | Status                     |
| --------------------------- | ------------: | -------------------------- |
| Supabase charges (live)     |     8,450,285 | ⚠ 60.5% of target          |
| DuckDB target (filtered)    |    13,972,316 | —                          |
| Gap                         |     5,522,031 | missing                    |
| Supabase providers          |         5,419 | ✅ all completed hospitals |
| Geocoded providers          | 5,148 (95.0%) | ⚠ 271 invisible to search  |
| Excluded hospitals (DuckDB) |           620 | ℹ Trilliant data quality   |

### Open Action Items

| Priority | Issue                                                | Rows Affected |
| -------- | ---------------------------------------------------- | ------------- |
| 🟡       | 271 providers null lat/lng — geocode backfill needed | —             |

### Data We're Sitting On

| Phase                                 | Available Rows | Status          |
| ------------------------------------- | -------------: | --------------- |
| 1-5: Current (1,002 curated codes)    |     13,972,316 | ✅ 60.5% live   |
| 6: All remaining codes (all settings) |   +260,327,512 | 📋 Planned      |
| 8: Payer-specific rates               | +6,381,051,296 | 🔮 Future infra |

_→ Full details in Sections 1–7 below_

## 1. Data Funnel

```
DuckDB (Trilliant Oria)
  ├─ Hospitals total:                     6,039
  │    ├─ status=completed:               5,419  → imported to Supabase
  │    └─ other status (excluded):          620  → never queried (see Section 4)
  │
  ├─ Raw charges (sum of total_charges_count across all hospitals):
  │              6,381,051,296  (~274M, not all are for our codes)
  │
  └─ Filtered charges (1,002 curated codes, all settings, completed hospitals):
                 13,972,316

Supabase (current state)
  ├─ Providers:    5,419  (5,148 geocoded, 271 null lat/lng — see Section 5)
  └─ Charges:   8,450,285

  Gap: 5,522,031 charges not yet in Supabase
       (Expected if NJ/PA not yet reimported. See MISSING rows in Section 3.)
```

## 2. DuckDB Hospital Status Breakdown

| Status               |     Count |
| -------------------- | --------: |
| `completed`          |     5,419 |
| `mrf_download_error` |       351 |
| `parse_error`        |       269 |
| **Total**            | **6,039** |

## 3. Per-State Data Table

_DuckDB: completed hospitals + filtered charge count (1,002 curated codes, all settings, completed hospitals only)_
_Supabase: providers imported + geocoding status + charges imported_
_**MISSING** = DuckDB has completed hospitals with charges, but Supabase has 0 charges (needs import)_

| State   | DDB Hosps | DDB Charges | SB Providers | SB Geocoded | SB Null Loc | SB Charges | Match     |
| ------- | --------: | ----------: | -----------: | ----------: | ----------: | ---------: | --------- |
| AK      |        20 |      27,746 |           20 |          20 |           0 |     21,544 | ⚠ partial |
| AL      |        90 |     131,023 |           90 |          88 |           2 |    122,035 | ⚠ partial |
| AR      |        98 |     102,614 |           98 |          73 |          25 |     88,755 | ⚠ partial |
| AZ      |        97 |     111,839 |           97 |          97 |           0 |     82,074 | ⚠ partial |
| CA      |       331 |     838,313 |          331 |         315 |          16 |    456,096 | ⚠ partial |
| CO      |       109 |     328,676 |          109 |         102 |           7 |    165,434 | ⚠ partial |
| CT      |        22 |      26,926 |           22 |          22 |           0 |     25,172 | ⚠ partial |
| DC      |        53 |       1,992 |           53 |          53 |           0 |      1,315 | ⚠ partial |
| DE      |        15 |      18,203 |           15 |          14 |           1 |     15,497 | ⚠ partial |
| FL      |       366 |   1,956,950 |          366 |         364 |           2 |  1,004,341 | ⚠ partial |
| GA      |       132 |     247,495 |          132 |         127 |           5 |    150,919 | ⚠ partial |
| HI      |        19 |      27,796 |           19 |          16 |           3 |     22,007 | ⚠ partial |
| IA      |        89 |     146,992 |           89 |          89 |           0 |    125,507 | ⚠ partial |
| ID      |        40 |      50,446 |           40 |          39 |           1 |     34,193 | ⚠ partial |
| IL      |       162 |     259,934 |          162 |         162 |           0 |    225,265 | ⚠ partial |
| IN      |       133 |     155,268 |          133 |         132 |           1 |    122,724 | ⚠ partial |
| KS      |       112 |     281,693 |          112 |         109 |           3 |    155,293 | ⚠ partial |
| KY      |       105 |     176,803 |          105 |         104 |           1 |    116,159 | ⚠ partial |
| LA      |       132 |     154,202 |          132 |         127 |           5 |    114,874 | ⚠ partial |
| MA      |       100 |     142,742 |          100 |          99 |           1 |    114,233 | ⚠ partial |
| MD      |        44 |      33,078 |           44 |          43 |           1 |     31,375 | ⚠ partial |
| ME      |        30 |      31,337 |           30 |          28 |           2 |     30,928 | ✓         |
| MI      |       136 |     209,531 |          136 |         131 |           5 |    200,540 | ✓         |
| MN      |        78 |     128,651 |           78 |          73 |           5 |    107,225 | ⚠ partial |
| MO      |       113 |     337,501 |          113 |         112 |           1 |    247,826 | ⚠ partial |
| MS      |        67 |      69,509 |           67 |          66 |           1 |     54,698 | ⚠ partial |
| MT      |        38 |      39,023 |           38 |          38 |           0 |     31,178 | ⚠ partial |
| NC      |       110 |     184,799 |          110 |          94 |          16 |    132,764 | ⚠ partial |
| ND      |        32 |      48,928 |           32 |          32 |           0 |     36,336 | ⚠ partial |
| NE      |        75 |     108,065 |           75 |          74 |           1 |     83,924 | ⚠ partial |
| NH      |        20 |     105,798 |           20 |          20 |           0 |     48,575 | ⚠ partial |
| NJ      |        94 |     186,233 |           94 |          88 |           6 |    162,024 | ⚠ partial |
| NM      |        37 |      20,933 |           37 |          36 |           1 |     15,060 | ⚠ partial |
| NV      |        63 |   1,358,838 |           63 |          63 |           0 |    552,157 | ⚠ partial |
| NY      |       139 |     278,203 |          139 |         137 |           2 |    230,691 | ⚠ partial |
| OH      |       229 |     263,032 |          229 |         221 |           8 |    235,612 | ⚠ partial |
| OK      |        97 |     109,240 |           97 |          97 |           0 |     94,619 | ⚠ partial |
| OR      |        50 |     149,795 |           50 |          49 |           1 |    107,847 | ⚠ partial |
| PA      |       243 |     380,021 |          243 |         234 |           9 |    320,531 | ⚠ partial |
| RI      |         9 |      13,940 |            9 |           9 |           0 |     11,715 | ⚠ partial |
| SC      |        70 |     111,195 |           70 |          69 |           1 |     63,095 | ⚠ partial |
| SD      |        22 |      26,801 |           22 |          21 |           1 |     25,977 | ✓         |
| TN      |       139 |     506,693 |          139 |         135 |           4 |    202,177 | ⚠ partial |
| TX      |       683 |   2,968,183 |          683 |         673 |          10 |  1,391,858 | ⚠ partial |
| UNKNOWN |       118 |     300,387 |          118 |           0 |         118 |    300,387 | ✓         |
| UT      |        58 |     148,778 |           58 |          58 |           0 |     62,762 | ⚠ partial |
| VA      |        98 |     254,686 |           98 |          96 |           2 |    146,933 | ⚠ partial |
| VT      |         7 |       7,498 |            7 |           7 |           0 |      7,173 | ✓         |
| WA      |        86 |     133,851 |           86 |          86 |           0 |    106,328 | ⚠ partial |
| WI      |       142 |     207,447 |          142 |         141 |           1 |    191,312 | ⚠ partial |
| WV      |        44 |      25,153 |           44 |          43 |           1 |     21,382 | ⚠ partial |
| WY      |        23 |      37,536 |           23 |          22 |           1 |     31,839 | ⚠ partial |

## 4. Excluded Hospitals (status != 'completed')

**620 hospitals** were excluded from the import because Trilliant did not fully
process them — the `status != 'completed'` filter in `importProviders()` drops them before any charge
data is queried. These are a Trilliant data quality limitation, not a ClearCost bug.

### By Status

| Status               | Count |
| -------------------- | ----: |
| `mrf_download_error` |   351 |
| `parse_error`        |   269 |

### Full Listing

| ID  | Name                                                                                                           | State   | City | Status               |
| --- | -------------------------------------------------------------------------------------------------------------- | ------- | ---- | -------------------- |
| 193 | 64-0362400 Anderson Regional Main Campus                                                                       | unknown | —    | `mrf_download_error` |
| 588 | 64-0362400 Anderson Regional South Campus                                                                      | unknown | —    | `mrf_download_error` |
| 54  | AHN Wexford Hospital                                                                                           | unknown | —    | `mrf_download_error` |
| 300 | ALICE PECK DAY MEMORIAL HOSPITAL                                                                               | unknown | —    | `mrf_download_error` |
| 258 | ANTELOPE MEMORIAL HOSPITAL                                                                                     | unknown | —    | `parse_error`        |
| 37  | ATRIUM MEDICAL CENTER                                                                                          | unknown | —    | `mrf_download_error` |
| 201 | Acadia St Landry Hospital Service District                                                                     | unknown | —    | `parse_error`        |
| 264 | Advanced Diagnostics Dallas                                                                                    | unknown | —    | `mrf_download_error` |
| 210 | AdventHealth Glenoaks                                                                                          | unknown | —    | `parse_error`        |
| 502 | Allegheny General Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 430 | Allegheny Valley Hospital                                                                                      | unknown | —    | `mrf_download_error` |
| 168 | Altus Emergency Centers - Lake Jackson                                                                         | unknown | —    | `parse_error`        |
| 39  | Altus Emergency Centers - Waxahachie                                                                           | unknown | —    | `parse_error`        |
| 66  | Anaheim Global Medical Center                                                                                  | unknown | —    | `parse_error`        |
| 320 | Annie Jeffrey Memorial County Health Center                                                                    | unknown | —    | `parse_error`        |
| 240 | Armstrong County Memorial Hospital                                                                             | unknown | —    | `parse_error`        |
| 414 | Ascension Alexian Brothers (Alexian Brothers Medical Center)                                                   | unknown | —    | `parse_error`        |
| 81  | Ascension Alexian Brothers Rehabilitation Hospital (Alexian Brothers Medical Center)                           | unknown | —    | `parse_error`        |
| 262 | Ascension All Saints Hospital - Spring Street Campus (Ascension All Saints Hospital, Inc.)                     | unknown | —    | `mrf_download_error` |
| 353 | Ascension All Saints Hospital - Wisconsin Avenue Campus (Ascension All Saints Hospital, Inc.)                  | unknown | —    | `mrf_download_error` |
| 381 | Ascension Borgess Allegan Hospital                                                                             | unknown | —    | `mrf_download_error` |
| 17  | Ascension Borgess Allegan Hospital                                                                             | unknown | —    | `mrf_download_error` |
| 287 | Ascension Borgess Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 358 | Ascension Borgess Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 499 | Ascension Borgess-Lee Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 276 | Ascension Borgess-Lee Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 576 | Ascension Borgess-Pipp Hospital (Ascension Borgess Hospital)                                                   | unknown | —    | `mrf_download_error` |
| 72  | Ascension Borgess-Pipp Hospital (Ascension Borgess Hospital)                                                   | unknown | —    | `mrf_download_error` |
| 2   | Ascension Borgess-Pipp Long-Term Acute Care Hospital (Ascension Borgess Hospital)                              | unknown | —    | `mrf_download_error` |
| 215 | Ascension Borgess-Pipp Long-Term Acute Care Hospital (Ascension Borgess Hospital)                              | unknown | —    | `mrf_download_error` |
| 102 | Ascension Brighton Center for Recovery                                                                         | unknown | —    | `mrf_download_error` |
| 231 | Ascension Calumet Hospital, Inc.                                                                               | unknown | —    | `mrf_download_error` |
| 265 | Ascension Columbia St. Mary's Hospital - Milwaukee Campus (Columbia St. Mary's Hospital Milwaukee, Inc.)       | unknown | —    | `mrf_download_error` |
| 82  | Ascension Columbia St. Mary's Hospital - Ozaukee Campus (Columbia St. Mary's Hospital Milwaukee, Inc.)         | unknown | —    | `mrf_download_error` |
| 350 | Ascension Columbia St. Mary's Hospital - Women's Medical Center (Columbia St. Mary's Hospital Milwaukee, Inc.) | unknown | —    | `mrf_download_error` |
| 246 | Ascension Genesys Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 566 | Ascension Holy Family (Presence Chicago Hospital Network)                                                      | unknown | —    | `mrf_download_error` |
| 529 | Ascension Macomb-Oakland Hospital, Madison Heights Campus                                                      | unknown | —    | `mrf_download_error` |
| 354 | Ascension Macomb-Oakland Hospital, Warren Campus                                                               | unknown | —    | `mrf_download_error` |
| 298 | Ascension Mercy (Presence Central and Suburban Hospitals Network)                                              | unknown | —    | `mrf_download_error` |
| 67  | Ascension NE Wisconsin - Mercy Campus (Ascension NE Wisconsin, Inc.)                                           | unknown | —    | `mrf_download_error` |
| 163 | Ascension NE Wisconsin - St. Elizabeth Campus (Ascension NE Wisconsin, Inc.)                                   | unknown | —    | `mrf_download_error` |
| 93  | Ascension Providence                                                                                           | unknown | —    | `mrf_download_error` |
| 200 | Ascension Providence Hospital - Novi Campus                                                                    | unknown | —    | `mrf_download_error` |
| 229 | Ascension Providence Hospital - Southfield Campus                                                              | unknown | —    | `mrf_download_error` |
| 492 | Ascension Providence Rochester Hospital                                                                        | unknown | —    | `mrf_download_error` |
| 382 | Ascension Resurrection (Presence Chicago Hospital Network)                                                     | unknown | —    | `mrf_download_error` |
| 524 | Ascension River District Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 248 | Ascension SE Wisconsin Hospital - Elmbrook Campus                                                              | unknown | —    | `mrf_download_error` |
| 351 | Ascension SE Wisconsin Hospital - Franklin Campus                                                              | unknown | —    | `mrf_download_error` |
| 100 | Ascension SE Wisconsin Hospital - St. Joseph Campus                                                            | unknown | —    | `mrf_download_error` |
| 617 | Ascension Sacred Heart Bay (Bay County Health System, Inc.)                                                    | unknown | —    | `mrf_download_error` |
| 425 | Ascension Sacred Heart Emerald Coast (Sacred Heart Health System, Inc.)                                        | unknown | —    | `mrf_download_error` |
| 144 | Ascension Sacred Heart Gulf (Sacred Heart Health System, Inc.)                                                 | unknown | —    | `mrf_download_error` |
| 471 | Ascension Sacred Heart Pensacola (Sacred Heart Health System, Inc.)                                            | unknown | —    | `mrf_download_error` |
| 280 | Ascension Sacred Heart Rehabilitation Hospital (Sacred Heart Rehabilitation Institute, Inc.)                   | unknown | —    | `mrf_download_error` |
| 15  | Ascension Saint Agnes Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 405 | Ascension Saint Elizabeth (Presence Chicago Hospitals Network)                                                 | unknown | —    | `mrf_download_error` |
| 194 | Ascension Saint Francis (Presence Chicago Hospital Network)                                                    | unknown | —    | `mrf_download_error` |
| 369 | Ascension Saint Joseph - Chicago (Presence Chicago Hospital Network)                                           | unknown | —    | `mrf_download_error` |
| 103 | Ascension Saint Joseph - Elgin (Presence Central and Suburban Hospitals Network)                               | unknown | —    | `mrf_download_error` |
| 299 | Ascension Saint Joseph - Joliet (Presence Central and Suburban Hospitals Network)                              | unknown | —    | `mrf_download_error` |
| 294 | Ascension Saint Mary - Chicago (Presence Chicago Hospital Network)                                             | unknown | —    | `mrf_download_error` |
| 319 | Ascension Saint Mary - Kankakee (Presence Central and Suburban Hospitals Network)                              | unknown | —    | `mrf_download_error` |
| 5   | Ascension Saint Thomas DeKalb                                                                                  | unknown | —    | `mrf_download_error` |
| 52  | Ascension Saint Thomas Highlands                                                                               | unknown | —    | `mrf_download_error` |
| 12  | Ascension Saint Thomas Midtown                                                                                 | unknown | —    | `mrf_download_error` |
| 406 | Ascension Saint Thomas River Park                                                                              | unknown | —    | `mrf_download_error` |
| 191 | Ascension Saint Thomas Rutherford                                                                              | unknown | —    | `mrf_download_error` |
| 31  | Ascension Saint Thomas Rutherford Westlawn                                                                     | unknown | —    | `mrf_download_error` |
| 151 | Ascension Saint Thomas Stones River                                                                            | unknown | —    | `mrf_download_error` |
| 337 | Ascension Saint Thomas Three Rivers                                                                            | unknown | —    | `mrf_download_error` |
| 65  | Ascension Saint Thomas West                                                                                    | unknown | —    | `mrf_download_error` |
| 242 | Ascension Seton Bastrop (Ascension Seton)                                                                      | unknown | —    | `mrf_download_error` |
| 408 | Ascension Seton Edgar B. Davis (Ascension Seton)                                                               | unknown | —    | `mrf_download_error` |
| 413 | Ascension Seton Hays (Ascension Seton)                                                                         | unknown | —    | `mrf_download_error` |
| 153 | Ascension Seton Highland Lakes (Ascension Seton)                                                               | unknown | —    | `mrf_download_error` |
| 281 | Ascension Seton Medical Center Austin (Ascension Seton)                                                        | unknown | —    | `mrf_download_error` |
| 288 | Ascension Seton Northwest (Ascension Seton)                                                                    | unknown | —    | `mrf_download_error` |
| 169 | Ascension Seton Shoal Creek (Ascension Seton)                                                                  | unknown | —    | `mrf_download_error` |
| 445 | Ascension Seton Smithville (Ascension Seton)                                                                   | unknown | —    | `mrf_download_error` |
| 553 | Ascension Seton Southwest (Ascension Seton)                                                                    | unknown | —    | `mrf_download_error` |
| 269 | Ascension Seton Williamson (Ascension Seton)                                                                   | unknown | —    | `mrf_download_error` |
| 120 | Ascension St. Francis Hospital, Inc.                                                                           | unknown | —    | `mrf_download_error` |
| 247 | Ascension St. John Broken Arrow (St. John Broken Arrow, Inc.)                                                  | unknown | —    | `mrf_download_error` |
| 34  | Ascension St. John Children's Hospital                                                                         | unknown | —    | `mrf_download_error` |
| 170 | Ascension St. John Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 411 | Ascension St. John Jane Phillips (Jane Phillips Memorial Medical Center, Inc.)                                 | unknown | —    | `mrf_download_error` |
| 119 | Ascension St. John Medical Center (St. John Medical Center, Inc.)                                              | unknown | —    | `mrf_download_error` |
| 143 | Ascension St. John Nowata (Jane Phillips Nowata Hospital, Inc.)                                                | unknown | —    | `mrf_download_error` |
| 523 | Ascension St. John Owasso (Owasso Medical Facility, Inc.)                                                      | unknown | —    | `mrf_download_error` |
| 610 | Ascension St. John Sapulpa (St. John Sapulpa, Inc.)                                                            | unknown | —    | `mrf_download_error` |
| 172 | Ascension St. Vincent Anderson (St. Vincent Anderson Regional Hospital, Inc.)                                  | unknown | —    | `mrf_download_error` |
| 344 | Ascension St. Vincent Carmel (St. Vincent Carmel Hospital, Inc.)                                               | unknown | —    | `mrf_download_error` |
| 115 | Ascension St. Vincent Clay (St. Vincent Clay Hospital, Inc.)                                                   | unknown | —    | `mrf_download_error` |
| 137 | Ascension St. Vincent Evansville (St. Mary's Health, Inc.)                                                     | unknown | —    | `mrf_download_error` |
| 348 | Ascension St. Vincent Fishers (St. Vincent Fishers Hospital, Inc.)                                             | unknown | —    | `mrf_download_error` |
| 237 | Ascension St. Vincent Heart Center (St. Vincent Heart Center of Indiana, LLC)                                  | unknown | —    | `mrf_download_error` |
| 171 | Ascension St. Vincent Hospital - Avon (St Vincent Hospital and Health Care Center Inc.)                        | unknown | —    | `mrf_download_error` |
| 175 | Ascension St. Vincent Hospital - Castleton (St Vincent Hospital and Health Care Center Inc.)                   | unknown | —    | `mrf_download_error` |
| 473 | Ascension St. Vincent Hospital - Indianapolis (St Vincent Hospital and Health Care Center Inc.)                | unknown | —    | `mrf_download_error` |
| 135 | Ascension St. Vincent Hospital - Indianapolis South (St Vincent Hospital and Health Care Center Inc.)          | unknown | —    | `mrf_download_error` |
| 394 | Ascension St. Vincent Hospital - Plainfield (St Vincent Hospital and Health Care Center Inc.)                  | unknown | —    | `mrf_download_error` |
| 452 | Ascension St. Vincent Jennings (St. Vincent Jennings Hospital, Inc.)                                           | unknown | —    | `mrf_download_error` |
| 611 | Ascension St. Vincent Kokomo (St. Joseph Hospital & Health Center, Inc.)                                       | unknown | —    | `mrf_download_error` |
| 393 | Ascension St. Vincent Mercy (St. Vincent Madison County Health System, Inc.)                                   | unknown | —    | `mrf_download_error` |
| 213 | Ascension St. Vincent Orthopedic Hospital (St. Mary's Health, Inc.)                                            | unknown | —    | `mrf_download_error` |
| 336 | Ascension St. Vincent Randolph (St. Vincent Randolph Hospital, Inc.)                                           | unknown | —    | `mrf_download_error` |
| 379 | Ascension St. Vincent Salem (St. Vincent Salem Hospital, Inc.)                                                 | unknown | —    | `mrf_download_error` |
| 249 | Ascension St. Vincent Seton (St. Vincent Seton Specialty Hospital, Inc.)                                       | unknown | —    | `mrf_download_error` |
| 314 | Ascension St. Vincent Stress Center (St Vincent Hospital and Health Care Center Inc.)                          | unknown | —    | `mrf_download_error` |
| 53  | Ascension St. Vincent Warrick (St. Mary's Warrick Hospital, Inc.)                                              | unknown | —    | `mrf_download_error` |
| 607 | Ascension St. Vincent Williamsport (St. Vincent Williamsport Hospital, Inc.)                                   | unknown | —    | `mrf_download_error` |
| 155 | Ascension St. Vincent Women's Hospital (St Vincent Hospital and Health Care Center Inc.)                       | unknown | —    | `mrf_download_error` |
| 574 | Ascension St. Vincent's Clay County (St. Vincent's Medical Center, Inc.)                                       | unknown | —    | `mrf_download_error` |
| 113 | Ascension St. Vincent's Riverside (St. Vincent's Medical Center, Inc.)                                         | unknown | —    | `mrf_download_error` |
| 254 | Ascension St. Vincent's Southside (St. Luke's-St. Vincent's HealthCare, Inc.)                                  | unknown | —    | `mrf_download_error` |
| 579 | Ascension St. Vincent's St. Johns County (St. Vincent's Health System, Inc.)                                   | unknown | —    | `mrf_download_error` |
| 476 | Ascension Via Christi Hospital Manhattan, Inc                                                                  | unknown | —    | `mrf_download_error` |
| 97  | Ascension Via Christi Hospital Pittsburg, Inc.                                                                 | unknown | —    | `mrf_download_error` |
| 180 | Ascension Via Christi Hospital St. Teresa, Inc.                                                                | unknown | —    | `mrf_download_error` |
| 253 | Ascension Via Christi Rehabilitation Hospital, Inc.                                                            | unknown | —    | `mrf_download_error` |
| 158 | Ascension Via Christi St. Francis (Ascension Via Christi Hospitals Wichita, Inc.)                              | unknown | —    | `mrf_download_error` |
| 208 | Ascension Via Christi St. Joseph (Ascension Via Christi Hospitals Wichita, Inc.)                               | unknown | —    | `mrf_download_error` |
| 563 | Baptist & Wolfson Oakleaf Emergency Room                                                                       | unknown | —    | `parse_error`        |
| 561 | Baptist Health Deaconess Madisonville, Inc                                                                     | unknown | —    | `mrf_download_error` |
| 179 | Baptist Health Hospital Doral                                                                                  | unknown | —    | `parse_error`        |
| 51  | Baptist Hospital                                                                                               | unknown | —    | `parse_error`        |
| 441 | Bariatric Center Lenexa                                                                                        | unknown | —    | `mrf_download_error` |
| 157 | Barnes Jewish Hospital                                                                                         | unknown | —    | `parse_error`        |
| 564 | Barnes Jewish West County Hospital                                                                             | unknown | —    | `parse_error`        |
| 19  | Bates County Memorial Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 578 | Bayonne Medical Center                                                                                         | unknown | —    | `parse_error`        |
| 544 | Beauregard Health System                                                                                       | unknown | —    | `parse_error`        |
| 245 | Bethesda Hospital East                                                                                         | unknown | —    | `parse_error`        |
| 260 | Bethesda Hospital West                                                                                         | unknown | —    | `parse_error`        |
| 467 | Big South Fork Medical Center                                                                                  | unknown | —    | `mrf_download_error` |
| 183 | Bitterroot Health                                                                                              | unknown | —    | `parse_error`        |
| 509 | Blackberry Center                                                                                              | unknown | —    | `parse_error`        |
| 75  | Boca Raton Regional Hospital                                                                                   | unknown | —    | `parse_error`        |
| 399 | Boston Medical Center                                                                                          | unknown | —    | `parse_error`        |
| 508 | Bothwell Regional Health Center                                                                                | unknown | —    | `parse_error`        |
| 256 | Bowen Health, Inc.                                                                                             | unknown | —    | `parse_error`        |
| 192 | Box Butte General Hospital                                                                                     | unknown | —    | `parse_error`        |
| 614 | Brentwood Meadows LLC                                                                                          | unknown | —    | `mrf_download_error` |
| 601 | Bridgeport Hospital                                                                                            | unknown | —    | `parse_error`        |
| 567 | Brookings Hospital                                                                                             | unknown | —    | `parse_error`        |
| 620 | Brooks Rehabilitation Hospital – Bartram Campus                                                                | unknown | —    | `parse_error`        |
| 541 | Brooks Rehabilitation Hospital – University Campus                                                             | unknown | —    | `parse_error`        |
| 464 | Buchanan County Health Center                                                                                  | unknown | —    | `parse_error`        |
| 150 | Bullock County Rural Emergency Hospital                                                                        | unknown | —    | `parse_error`        |
| 10  | CENTENNIAL MEDICAL CENTER                                                                                      | unknown | —    | `mrf_download_error` |
| 496 | CHESHIRE MEDICAL CENTER                                                                                        | unknown | —    | `mrf_download_error` |
| 519 | CJW - JOHNSTON WILLIS CAMPUS                                                                                   | unknown | —    | `mrf_download_error` |
| 25  | CJW Medical Center-Chippenham Hospital Campus                                                                  | unknown | —    | `mrf_download_error` |
| 582 | Cabell Huntington Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 293 | Caldwell Medical Center                                                                                        | unknown | —    | `mrf_download_error` |
| 357 | Caldwell Regional Medical Center                                                                               | unknown | —    | `parse_error`        |
| 494 | Calvert Health                                                                                                 | unknown | —    | `mrf_download_error` |
| 94  | Cambridge Health Alliance                                                                                      | unknown | —    | `parse_error`        |
| 335 | Cameron Regional Medical Center                                                                                | unknown | —    | `mrf_download_error` |
| 581 | Canonsburg General Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 562 | CareWell Health                                                                                                | unknown | —    | `parse_error`        |
| 7   | Carrus Behavioral Hospital                                                                                     | unknown | —    | `parse_error`        |
| 341 | Carrus Rehabilitation Hospital                                                                                 | unknown | —    | `parse_error`        |
| 370 | Casa Colina Hospital and Centers for Healthcare                                                                | unknown | —    | `mrf_download_error` |
| 472 | Cedar Crest Hospital & Residential Treatment Center                                                            | unknown | —    | `mrf_download_error` |
| 36  | Center for Digestive Health, LLC                                                                               | unknown | —    | `mrf_download_error` |
| 439 | CenterPointe Hospital                                                                                          | unknown | —    | `mrf_download_error` |
| 188 | Central Indiana-AMG Specialty Hospital                                                                         | unknown | —    | `parse_error`        |
| 313 | Central WA Hospital & Clinics                                                                                  | unknown | —    | `parse_error`        |
| 184 | Chapman Global Medical Center                                                                                  | unknown | —    | `parse_error`        |
| 546 | Chicago Behavioral Hospital                                                                                    | unknown | —    | `parse_error`        |
| 537 | Children's Healthcare of Atlanta at Arthur M. Blank                                                            | unknown | —    | `mrf_download_error` |
| 434 | Children's Healthcare of Atlanta at Hughes Spalding                                                            | unknown | —    | `mrf_download_error` |
| 317 | Children's Healthcare of Atlanta at Scottish Rite                                                              | unknown | —    | `mrf_download_error` |
| 371 | Children's Hospital New Orleans                                                                                | unknown | —    | `parse_error`        |
| 63  | Children’s Medical Center Dallas                                                                               | unknown | —    | `parse_error`        |
| 474 | Children’s Medical Center Plano                                                                                | unknown | —    | `parse_error`        |
| 255 | Chris Kyle Patriots Hospital                                                                                   | unknown | —    | `parse_error`        |
| 284 | Christ Hospital                                                                                                | unknown | —    | `parse_error`        |
| 133 | ClearSky Rehabilitation Hospital of Flower Mound                                                               | unknown | —    | `parse_error`        |
| 450 | Coal County General Hospital                                                                                   | unknown | —    | `parse_error`        |
| 123 | Coffeyville Regional Medical Center                                                                            | unknown | —    | `mrf_download_error` |
| 387 | Columbus Specialty Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 338 | Concho County Hospital                                                                                         | unknown | —    | `parse_error`        |
| 552 | Cook Hospital                                                                                                  | unknown | —    | `mrf_download_error` |
| 48  | Copiah County Medical Center                                                                                   | unknown | —    | `parse_error`        |
| 152 | Copper Hills Youth Center                                                                                      | unknown | —    | `parse_error`        |
| 209 | Cornerstone Specialty Hospitals Shawnee                                                                        | unknown | —    | `parse_error`        |
| 296 | Covington-AMG Physical Rehabilitation Hospital                                                                 | unknown | —    | `parse_error`        |
| 321 | DEL SOL MEDICAL CENTER                                                                                         | unknown | —    | `mrf_download_error` |
| 438 | Dameron Hospital                                                                                               | unknown | —    | `parse_error`        |
| 482 | Davis Medical Center                                                                                           | unknown | —    | `mrf_download_error` |
| 318 | Day Kimball Healthcare                                                                                         | unknown | —    | `parse_error`        |
| 455 | Dayton General Hospital                                                                                        | unknown | —    | `parse_error`        |
| 224 | Deaconess Illinois Red Bud Regional Hospital                                                                   | unknown | —    | `parse_error`        |
| 214 | Dell Children's Medical Center (Ascension Seton)                                                               | unknown | —    | `mrf_download_error` |
| 556 | Dell Children's Medical Center North Campus (Ascension Seton)                                                  | unknown | —    | `mrf_download_error` |
| 429 | Dell Seton Medical Center at The University of Texas (Ascension Seton)                                         | unknown | —    | `mrf_download_error` |
| 225 | Delta Health System                                                                                            | unknown | —    | `parse_error`        |
| 378 | Doctors Hospital                                                                                               | unknown | —    | `parse_error`        |
| 279 | Dorminy Medical Center                                                                                         | unknown | —    | `parse_error`        |
| 161 | Drumright Regional Hospital                                                                                    | unknown | —    | `parse_error`        |
| 447 | ERLC, LLC d/b/a Elitecare Emergency Hospital                                                                   | unknown | —    | `parse_error`        |
| 586 | East Jefferson General Hospital                                                                                | unknown | —    | `parse_error`        |
| 366 | Eastern Oklahoma Medical Center                                                                                | unknown | —    | `mrf_download_error` |
| 187 | Ed Fraser Memorial Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 419 | Ellett Memorial Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 535 | Ely Bloomenson Community Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 575 | Eminent Medical Center                                                                                         | unknown | —    | `parse_error`        |
| 24  | Evergreen Medical Center                                                                                       | unknown | —    | `mrf_download_error` |
| 216 | Exeter Hospital                                                                                                | unknown | —    | `mrf_download_error` |
| 177 | Fairview Bethesda Hospital                                                                                     | unknown | —    | `parse_error`        |
| 420 | Fairview Bethesda Hospital                                                                                     | unknown | —    | `parse_error`        |
| 32  | Fairview Bethesda Hospital                                                                                     | unknown | —    | `parse_error`        |
| 368 | Family Health West Hospital                                                                                    | unknown | —    | `parse_error`        |
| 239 | First Care Health Center                                                                                       | unknown | —    | `parse_error`        |
| 385 | Fishermens Community Hospital                                                                                  | unknown | —    | `parse_error`        |
| 572 | Forbes Hospital                                                                                                | unknown | —    | `mrf_download_error` |
| 166 | Freedom Behavioral Hospital Of Monroe                                                                          | unknown | —    | `parse_error`        |
| 468 | Freedom Behavioral Hospital Of Plainview                                                                       | unknown | —    | `parse_error`        |
| 483 | Freeman Fort Scott Hospital Acute Inpatient Hospital                                                           | unknown | —    | `parse_error`        |
| 423 | Freeman Hospital East Campus Acute Rehab                                                                       | unknown | —    | `parse_error`        |
| 559 | Freeman Hospital East Campus Inpatient Geri Psych                                                              | unknown | —    | `parse_error`        |
| 558 | Freeman Hospital East Campus Inpatient Psych                                                                   | unknown | —    | `parse_error`        |
| 1   | Freeman Hospital West Campus Acute Inpatient Hospital                                                          | unknown | —    | `parse_error`        |
| 160 | Freeman Neosho Hospital Inpatient Critical Access                                                              | unknown | —    | `parse_error`        |
| 122 | Freeman Neosho Hospital Inpatient Swing Bed                                                                    | unknown | —    | `parse_error`        |
| 112 | Geisinger Bloomsburg Hospital                                                                                  | unknown | —    | `parse_error`        |
| 360 | Geisinger Community Medical Center                                                                             | unknown | —    | `parse_error`        |
| 417 | Geisinger Jersey Shore Hospital                                                                                | unknown | —    | `parse_error`        |
| 227 | Geisinger Lewistown Hospital                                                                                   | unknown | —    | `parse_error`        |
| 263 | Geisinger Medical Center                                                                                       | unknown | —    | `mrf_download_error` |
| 283 | Geisinger Medical Center Muncy                                                                                 | unknown | —    | `mrf_download_error` |
| 189 | Geisinger Shamokin Area Community Hospital                                                                     | unknown | —    | `mrf_download_error` |
| 555 | Geisinger Wyoming Valley                                                                                       | unknown | —    | `parse_error`        |
| 372 | Golden Plains Community Hospital                                                                               | unknown | —    | `parse_error`        |
| 308 | Gove County Medical Center                                                                                     | unknown | —    | `parse_error`        |
| 391 | Grady Health System                                                                                            | unknown | —    | `mrf_download_error` |
| 531 | Grand Itasca Clinic and Hospital                                                                               | unknown | —    | `parse_error`        |
| 275 | Grand Itasca Clinic and Hospital                                                                               | unknown | —    | `parse_error`        |
| 538 | Great River Medical Center                                                                                     | unknown | —    | `parse_error`        |
| 365 | Greene County Medical Center                                                                                   | unknown | —    | `parse_error`        |
| 266 | Greenwich Hospital                                                                                             | unknown | —    | `parse_error`        |
| 139 | Grove Center Medical Center                                                                                    | unknown | —    | `mrf_download_error` |
| 233 | Grove Hill Memorial hospital                                                                                   | unknown | —    | `parse_error`        |
| 373 | HANOVER EMERGENCY CENTER                                                                                       | unknown | —    | `mrf_download_error` |
| 465 | HCA FLORIDA LEHIGH HOSPITAL                                                                                    | unknown | —    | `mrf_download_error` |
| 322 | HCA HEALTHCARE BRIGHTON PARK ER                                                                                | unknown | —    | `mrf_download_error` |
| 182 | HCA HEALTHCARE CENTRE POINTE ER                                                                                | unknown | —    | `mrf_download_error` |
| 600 | HCA HEALTHCARE JAMES ISLAND ER                                                                                 | unknown | —    | `mrf_download_error` |
| 501 | HCA HEALTHCARE MONCKS CORNER ER                                                                                | unknown | —    | `mrf_download_error` |
| 226 | HCA HEALTHCARE SUMMERVILLE HOSPITAL                                                                            | unknown | —    | `mrf_download_error` |
| 495 | HCA HEALTHCARE TRIDENT HOSPITAL                                                                                | unknown | —    | `mrf_download_error` |
| 306 | HCA HOUSTON ER 24/7 FALLBROOK                                                                                  | unknown | —    | `mrf_download_error` |
| 533 | HCA HOUSTON ER 24/7 SPRING                                                                                     | unknown | —    | `mrf_download_error` |
| 79  | HCA HealthONE SOUTHWEST ER, A PART OF SWEDISH                                                                  | unknown | —    | `mrf_download_error` |
| 178 | HENRICO DOCTORS HOSPITAL                                                                                       | unknown | —    | `mrf_download_error` |
| 584 | HOLY CROSS HOSPITAL                                                                                            | unknown | —    | `mrf_download_error` |
| 211 | HSHS Good Shepherd Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 618 | HSHS St. John's Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 73  | HSS Brooklyn Outpatient Center                                                                                 | unknown | —    | `mrf_download_error` |
| 46  | HSS East Side Outpatient Center                                                                                | unknown | —    | `mrf_download_error` |
| 241 | HSS Hudson Yards Outpatient Center                                                                             | unknown | —    | `mrf_download_error` |
| 223 | HSS Long Island Outpatient Center                                                                              | unknown | —    | `mrf_download_error` |
| 590 | HSS Midtown Outpatient Center                                                                                  | unknown | —    | `mrf_download_error` |
| 593 | HSS Paramus Midland Outpatient Center                                                                          | unknown | —    | `mrf_download_error` |
| 418 | HSS Paramus Outpatient Center                                                                                  | unknown | —    | `mrf_download_error` |
| 185 | HSS Queens Outpatient Center                                                                                   | unknown | —    | `mrf_download_error` |
| 427 | HSS Southampton Outpatient Center                                                                              | unknown | —    | `mrf_download_error` |
| 568 | HSS Stamford Outpatient Center                                                                                 | unknown | —    | `mrf_download_error` |
| 86  | HSS West Side Outpatient Center                                                                                | unknown | —    | `mrf_download_error` |
| 573 | HSS Westchester Outpatient Center                                                                              | unknown | —    | `mrf_download_error` |
| 57  | Halifax Health \| Brooks Rehabilitation – Center for Inpatient Rehabilitation                                  | unknown | —    | `parse_error`        |
| 532 | Hansen Family Hospital - Iowa Falls, IA                                                                        | unknown | —    | `parse_error`        |
| 380 | Harmon Memorial Hospital                                                                                       | unknown | —    | `parse_error`        |
| 154 | Harney District Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 142 | Harrisburg Medical Center                                                                                      | unknown | —    | `mrf_download_error` |
| 126 | HealthEast St. John's Hospital                                                                                 | unknown | —    | `parse_error`        |
| 506 | HealthEast St. John's Hospital                                                                                 | unknown | —    | `parse_error`        |
| 108 | HealthEast St. John's Hospital                                                                                 | unknown | —    | `parse_error`        |
| 521 | HealthEast Woodwinds Hospital                                                                                  | unknown | —    | `parse_error`        |
| 480 | HealthEast Woodwinds Hospital                                                                                  | unknown | —    | `parse_error`        |
| 289 | HealthEast Woodwinds Hospital                                                                                  | unknown | —    | `parse_error`        |
| 604 | Hemet Global Medical Center                                                                                    | unknown | —    | `parse_error`        |
| 602 | Hemet Global Medical Center                                                                                    | unknown | —    | `parse_error`        |
| 603 | Herrin Hospital                                                                                                | unknown | —    | `mrf_download_error` |
| 539 | Highlands Medical Center                                                                                       | unknown | —    | `parse_error`        |
| 440 | Hillsboro Community Hospital                                                                                   | unknown | —    | `parse_error`        |
| 295 | Hillsboro Medical Center                                                                                       | unknown | —    | `parse_error`        |
| 141 | Hillsdale Community Health Center                                                                              | unknown | —    | `mrf_download_error` |
| 424 | Hoboken University Medical Center                                                                              | unknown | —    | `parse_error`        |
| 543 | Holy Cross Health Germantown                                                                                   | unknown | —    | `parse_error`        |
| 547 | Holy Cross Health Silver Spring                                                                                | unknown | —    | `parse_error`        |
| 437 | Holy Name Medical Center                                                                                       | unknown | —    | `mrf_download_error` |
| 290 | Homestead Hospital                                                                                             | unknown | —    | `parse_error`        |
| 257 | Hopedale Medical Complex                                                                                       | unknown | —    | `parse_error`        |
| 339 | Hospital for Behavioral Medicine                                                                               | unknown | —    | `parse_error`        |
| 517 | Hospital for Special Surgery Main Hospital                                                                     | unknown | —    | `mrf_download_error` |
| 156 | Houma-AMG Specialty Hospital                                                                                   | unknown | —    | `parse_error`        |
| 560 | Huntington Hospital                                                                                            | unknown | —    | `mrf_download_error` |
| 432 | Huron Regional Medical Center                                                                                  | unknown | —    | `mrf_download_error` |
| 205 | Imaging Center Gloster Creek Village, PLLC                                                                     | unknown | —    | `mrf_download_error` |
| 272 | Iredell Davis Behavioral Health Hospital                                                                       | unknown | —    | `parse_error`        |
| 491 | Iredell Memorial Hospital                                                                                      | unknown | —    | `parse_error`        |
| 33  | Izard Regional Hospital LLC                                                                                    | unknown | —    | `mrf_download_error` |
| 303 | Jack Hughston Memorial Hospital                                                                                | unknown | —    | `mrf_download_error` |
| 343 | Jackson County Memorial Hospital                                                                               | unknown | —    | `parse_error`        |
| 332 | Jackson County Regional Health Center                                                                          | unknown | —    | `parse_error`        |
| 331 | Jefferson Regional Medical Center                                                                              | unknown | —    | `mrf_download_error` |
| 515 | Jennie Stuart Medical Center                                                                                   | unknown | —    | `mrf_download_error` |
| 456 | Jupiter Medical Center                                                                                         | unknown | —    | `parse_error`        |
| 285 | K. Hovnanian Children's Hospital                                                                               | unknown | —    | `parse_error`        |
| 105 | Kahuku Medical Center                                                                                          | unknown | —    | `parse_error`        |
| 74  | Kern Medical Center                                                                                            | unknown | —    | `mrf_download_error` |
| 376 | LAS PALMAS DEL SOL EMERGENCY CENTER EAST                                                                       | unknown | —    | `mrf_download_error` |
| 388 | LAS PALMAS DEL SOL HEALTHCARE HORIZON (ER)                                                                     | unknown | —    | `mrf_download_error` |
| 580 | LECOM Medical Center                                                                                           | unknown | —    | `mrf_download_error` |
| 407 | La Amistad Behavioral Health Services                                                                          | unknown | —    | `parse_error`        |
| 116 | La Casa Psychiatric Health Facility                                                                            | unknown | —    | `parse_error`        |
| 410 | Lackey Memorial Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 129 | Lafayette Physical Rehabilitation Hospital                                                                     | unknown | —    | `parse_error`        |
| 412 | Lafayette-AMG Specialty Hospital                                                                               | unknown | —    | `parse_error`        |
| 176 | Lake Behavioral Hospital                                                                                       | unknown | —    | `parse_error`        |
| 220 | Lake Regional Health System                                                                                    | unknown | —    | `mrf_download_error` |
| 362 | Lakeland Behavioral Health System                                                                              | unknown | —    | `mrf_download_error` |
| 202 | Las Vegas-AMG Specialty Hospital                                                                               | unknown | —    | `parse_error`        |
| 346 | Lauderdale Community Hospital                                                                                  | unknown | —    | `parse_error`        |
| 124 | Lawrence + Memorial Hospital                                                                                   | unknown | —    | `parse_error`        |
| 111 | Legacy Unity Center for Behavioral Health PES                                                                  | unknown | —    | `parse_error`        |
| 244 | Lincoln County Hospital District                                                                               | unknown | —    | `mrf_download_error` |
| 549 | Little River Medical Center, INC DBA Little River Memorial Hospital                                            | unknown | —    | `mrf_download_error` |
| 400 | Livingston HealthCare                                                                                          | unknown | —    | `parse_error`        |
| 11  | Loretto Hospital                                                                                               | unknown | —    | `parse_error`        |
| 44  | M Health Fairview Lakes Hospital                                                                               | unknown | —    | `parse_error`        |
| 449 | M Health Fairview Lakes Medical Center                                                                         | unknown | —    | `parse_error`        |
| 173 | M Health Fairview Lakes Medical Center                                                                         | unknown | —    | `parse_error`        |
| 512 | M Health Fairview Maple Grove Surgery Center                                                                   | unknown | —    | `parse_error`        |
| 222 | M Health Fairview Maple Grove Surgery Center                                                                   | unknown | —    | `parse_error`        |
| 43  | M Health Fairview Maple Grove Surgery Center                                                                   | unknown | —    | `parse_error`        |
| 117 | M Health Fairview Northland Medical                                                                            | unknown | —    | `parse_error`        |
| 234 | M Health Fairview Northland Medical Center                                                                     | unknown | —    | `parse_error`        |
| 85  | M Health Fairview Northland Medical Center                                                                     | unknown | —    | `parse_error`        |
| 389 | M Health Fairview Ridges Hospital                                                                              | unknown | —    | `parse_error`        |
| 190 | M Health Fairview Ridges Hospital                                                                              | unknown | —    | `parse_error`        |
| 20  | M Health Fairview Ridges Hospital                                                                              | unknown | —    | `parse_error`        |
| 416 | M Health Fairview Southdale Hospital                                                                           | unknown | —    | `parse_error`        |
| 518 | M Health Fairview Southdale Hospital                                                                           | unknown | —    | `parse_error`        |
| 9   | M Health Fairview Southdale Hospital                                                                           | unknown | —    | `parse_error`        |
| 396 | M Health Fairview University of Minnesota Masonic Children's Hospital                                          | unknown | —    | `parse_error`        |
| 109 | M Health Fairview University of Minnesota Masonic Children's Hospital                                          | unknown | —    | `parse_error`        |
| 55  | M Health Fairview University of Minnesota Masonic Children's Hospital                                          | unknown | —    | `parse_error`        |
| 186 | M Health Fairview University of Minnesota Medical Center                                                       | unknown | —    | `parse_error`        |
| 457 | M Health Fairview University of Minnesota Medical Center                                                       | unknown | —    | `parse_error`        |
| 121 | M Health Fairview University of Minnesota Medical Center                                                       | unknown | —    | `parse_error`        |
| 327 | MEDICAL CITY CHILDREN'S HOSPITAL                                                                               | unknown | —    | `mrf_download_error` |
| 274 | MEDICAL CITY DALLAS HOSPITAL                                                                                   | unknown | —    | `mrf_download_error` |
| 328 | MEDICAL CITY ER GARLAND                                                                                        | unknown | —    | `mrf_download_error` |
| 3   | MISSION HOSPITAL                                                                                               | unknown | —    | `mrf_download_error` |
| 221 | MISSION MAMA                                                                                                   | unknown | —    | `mrf_download_error` |
| 435 | MOUNT SINAI HOSPITAL MEDICAL CENTER                                                                            | unknown | —    | `mrf_download_error` |
| 278 | MOUNTAIN COMMUNITIES HEALTHCARE DISTRICT                                                                       | unknown | —    | `mrf_download_error` |
| 130 | MUSC Health Orangeburg                                                                                         | unknown | —    | `mrf_download_error` |
| 498 | Madison Health                                                                                                 | unknown | —    | `parse_error`        |
| 415 | Magnolia Regional Medical Center                                                                               | unknown | —    | `parse_error`        |
| 421 | Mariners Hospital                                                                                              | unknown | —    | `parse_error`        |
| 615 | Mary Rutan Health                                                                                              | unknown | —    | `mrf_download_error` |
| 128 | McCurtain Memorial Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 390 | MeadowWood Behavioral Health Hospital                                                                          | unknown | —    | `mrf_download_error` |
| 297 | MedStar Health Physical Therapy at Irving Street-Neurorehabilitation Center                                    | unknown | —    | `parse_error`        |
| 475 | Medical Arts Hospital                                                                                          | unknown | —    | `parse_error`        |
| 401 | Mee Memorial Hospital                                                                                          | unknown | —    | `mrf_download_error` |
| 181 | Memorial Hermann Imaging Center (All Centers Except Bellaire/Cypress/Texas Medical Center/Upper Kirby)         | unknown | —    | `mrf_download_error` |
| 27  | Memorial Hospital                                                                                              | unknown | —    | `mrf_download_error` |
| 488 | Memorial Hospital of Carbondale                                                                                | unknown | —    | `mrf_download_error` |
| 613 | Menifee Global Medical Center                                                                                  | unknown | —    | `parse_error`        |
| 91  | Methodist Women's Hosptial                                                                                     | unknown | —    | `parse_error`        |
| 140 | Midland County Hospital District                                                                               | unknown | —    | `mrf_download_error` |
| 591 | Midland Memorial Hospital                                                                                      | unknown | —    | `mrf_download_error` |
| 426 | Midwest Orthopedic Specialty Hospital                                                                          | unknown | —    | `mrf_download_error` |
| 520 | Milford Hospital                                                                                               | unknown | —    | `parse_error`        |
| 18  | Mineral Community Hospital                                                                                     | unknown | —    | `parse_error`        |
| 355 | Minidoka Memorial Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 409 | Missouri Baptist Medical Center                                                                                | unknown | —    | `parse_error`        |
| 461 | Missouri Delta Medical Center                                                                                  | unknown | —    | `mrf_download_error` |
| 311 | Mon Health Marion Neighborhood Hospital                                                                        | unknown | —    | `mrf_download_error` |
| 21  | Munising Memorial Hospital                                                                                     | unknown | —    | `parse_error`        |
| 315 | NW Indiana-AMG Specialty Hospital                                                                              | unknown | —    | `parse_error`        |
| 8   | NYU Langone Hospital - Brooklyn                                                                                | unknown | —    | `parse_error`        |
| 49  | NYU Langone Hospital - Long Island                                                                             | unknown | —    | `parse_error`        |
| 436 | NYU Langone Orthopedic Hospital                                                                                | unknown | —    | `parse_error`        |
| 148 | NYU Langone Tisch Hospital                                                                                     | unknown | —    | `parse_error`        |
| 363 | Nebraska Methodist Hospital                                                                                    | unknown | —    | `parse_error`        |
| 550 | New Orleans East Hospital                                                                                      | unknown | —    | `parse_error`        |
| 460 | Newberry County Memorial Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 204 | North MS Ambulatory Surgery Center, LLC                                                                        | unknown | —    | `mrf_download_error` |
| 522 | North Mississippi Specialty Hospital                                                                           | unknown | —    | `parse_error`        |
| 58  | North Tampa Behavioral Health Hospital                                                                         | unknown | —    | `mrf_download_error` |
| 585 | Northeast Rehabilitation Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 551 | Northern Light Inland Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 165 | Northern Light Mayo Hospital                                                                                   | unknown | —    | `parse_error`        |
| 228 | Northside Hospital Gwinnett                                                                                    | unknown | —    | `mrf_download_error` |
| 583 | Northwest Community Hospital                                                                                   | unknown | —    | `mrf_download_error` |
| 89  | Northwestern Medical Center                                                                                    | unknown | —    | `parse_error`        |
| 606 | Northwestern Medicine Central DuPage Hospital                                                                  | unknown | —    | `mrf_download_error` |
| 134 | Northwestern Medicine Delnor Hospital                                                                          | unknown | —    | `mrf_download_error` |
| 516 | Northwestern Medicine Kishwaukee Hospital                                                                      | unknown | —    | `mrf_download_error` |
| 485 | Northwestern Medicine Lake Forest Hospital                                                                     | unknown | —    | `mrf_download_error` |
| 514 | Northwestern Medicine Marianjoy Rehabilitation Hospital                                                        | unknown | —    | `mrf_download_error` |
| 333 | Northwestern Medicine McHenry Hospital                                                                         | unknown | —    | `mrf_download_error` |
| 70  | Northwestern Medicine Palos Hospital                                                                           | unknown | —    | `mrf_download_error` |
| 127 | Northwestern Medicine Valley West Hospital                                                                     | unknown | —    | `mrf_download_error` |
| 174 | Northwestern Memorial Hospital                                                                                 | unknown | —    | `mrf_download_error` |
| 329 | Norton Children's Hospital                                                                                     | unknown | —    | `parse_error`        |
| 536 | Norton County Hospital                                                                                         | unknown | —    | `parse_error`        |
| 95  | OKC-AMG Specialty Hospital                                                                                     | unknown | —    | `parse_error`        |
| 132 | OSS Health                                                                                                     | unknown | —    | `parse_error`        |
| 292 | Oasis Behavioral Health Hospital                                                                               | unknown | —    | `mrf_download_error` |
| 312 | Oceans Behavioral Hospital Alexandria                                                                          | unknown | —    | `parse_error`        |
| 503 | Ochiltree General Hospital                                                                                     | unknown | —    | `mrf_download_error` |
| 118 | Ochsner Baptist                                                                                                | unknown | —    | `mrf_download_error` |
| 334 | Ochsner Hospital for Orthopedics and Sports Medicine                                                           | unknown | —    | `mrf_download_error` |
| 136 | Ochsner Medical Center - Jefferson Highway                                                                     | unknown | —    | `mrf_download_error` |
| 497 | Ochsner Medical Center - West Bank Campus                                                                      | unknown | —    | `mrf_download_error` |
| 164 | Onslow Memorial Hospital, Inc.                                                                                 | unknown | —    | `mrf_download_error` |
| 609 | Orthopaedic Hospital of Wisconsin, LLC                                                                         | unknown | —    | `mrf_download_error` |
| 596 | PARHAM DOCTORS HOSPITAL                                                                                        | unknown | —    | `mrf_download_error` |
| 433 | Palo Pinto General Hospital                                                                                    | unknown | —    | `parse_error`        |
| 16  | Park Royal Hospital                                                                                            | unknown | —    | `mrf_download_error` |
| 477 | Parkside Psychiatric Hospital                                                                                  | unknown | —    | `parse_error`        |
| 273 | Peyton Manning Children's Hospital at Ascension St. Vincent (St Vincent Hospital and Health Care Center Inc.)  | unknown | —    | `mrf_download_error` |
| 219 | Piedmont Henry                                                                                                 | unknown | —    | `mrf_download_error` |
| 487 | Piedmont McDuffie                                                                                              | unknown | —    | `parse_error`        |
| 302 | Piedmont Mountainside                                                                                          | unknown | —    | `mrf_download_error` |
| 330 | Pontiac General Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 14  | Port St Lucie Hospital                                                                                         | unknown | —    | `parse_error`        |
| 218 | Prisma Health Baptist Easley Hospital                                                                          | unknown | —    | `parse_error`        |
| 462 | Prisma Health Baptist Hospital                                                                                 | unknown | —    | `parse_error`        |
| 50  | Prisma Health Baptist Parkridge Hospital                                                                       | unknown | —    | `parse_error`        |
| 78  | Prisma Health Greenville Memorial Hospital                                                                     | unknown | —    | `parse_error`        |
| 565 | Prisma Health Greer Memorial Hospital                                                                          | unknown | —    | `parse_error`        |
| 356 | Prisma Health Hillcrest Memorial Hospital                                                                      | unknown | —    | `parse_error`        |
| 534 | Prisma Health Laurens County Hospital                                                                          | unknown | —    | `parse_error`        |
| 270 | Prisma Health North Greenville Hospital                                                                        | unknown | —    | `parse_error`        |
| 47  | Prisma Health Oconee Memorial Hospital                                                                         | unknown | —    | `parse_error`        |
| 323 | Prisma Health Patewood Memorial Hospital                                                                       | unknown | —    | `parse_error`        |
| 29  | Prisma Health Richland Hospital                                                                                | unknown | —    | `parse_error`        |
| 145 | Prisma Health Tuomey Hospital                                                                                  | unknown | —    | `parse_error`        |
| 42  | ProMedica Flower Hospital                                                                                      | unknown | —    | `mrf_download_error` |
| 345 | ProMedica Russell J. Ebeid Children's Hospital                                                                 | unknown | —    | `mrf_download_error` |
| 162 | ProMedica Toledo Hospital                                                                                      | unknown | —    | `mrf_download_error` |
| 340 | ProMedica Wildwood Orthopaedic and Spine Hospital                                                              | unknown | —    | `mrf_download_error` |
| 505 | Progress West Hospital                                                                                         | unknown | —    | `parse_error`        |
| 402 | Psychiatric Care at Delmar Campus                                                                              | unknown | —    | `parse_error`        |
| 444 | Punxsutawney Area Hospital                                                                                     | unknown | —    | `parse_error`        |
| 22  | RETREAT HOSPITAL                                                                                               | unknown | —    | `mrf_download_error` |
| 493 | RML Specialty Hospital Chicago                                                                                 | unknown | —    | `parse_error`        |
| 513 | RML Specialty Hospital Hinsdale                                                                                | unknown | —    | `parse_error`        |
| 26  | Randolph Health                                                                                                | unknown | —    | `mrf_download_error` |
| 305 | Range Regional Health Services                                                                                 | unknown | —    | `parse_error`        |
| 466 | Ray County Hospital and Healthcare                                                                             | unknown | —    | `parse_error`        |
| 342 | Redeemer Health                                                                                                | unknown | —    | `parse_error`        |
| 398 | Rehabilitation Institute of Chicago d/b/a Shirley Ryan Abilitylab                                              | unknown | —    | `mrf_download_error` |
| 384 | Resurrection Medical Center                                                                                    | unknown | —    | `mrf_download_error` |
| 374 | Rhea Medical Center                                                                                            | unknown | —    | `mrf_download_error` |
| 595 | Rice County District Hospital                                                                                  | unknown | —    | `parse_error`        |
| 422 | Ridgeview Behavioral Hospital                                                                                  | unknown | —    | `parse_error`        |
| 504 | Ridgeview Institute of Monroe                                                                                  | unknown | —    | `parse_error`        |
| 324 | Ridgeview Institute of Smyrna                                                                                  | unknown | —    | `parse_error`        |
| 616 | River Place Behavioral Health Hospital                                                                         | unknown | —    | `mrf_download_error` |
| 347 | River's Edge Hospital                                                                                          | unknown | —    | `mrf_download_error` |
| 13  | Riverside Medical Center                                                                                       | unknown | —    | `parse_error`        |
| 489 | Riverside Medical Center                                                                                       | unknown | —    | `parse_error`        |
| 526 | Riverview Behavioral Health Hospital                                                                           | unknown | —    | `mrf_download_error` |
| 235 | Rogers Memorial Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 554 | Rolling Hills Hospital                                                                                         | unknown | —    | `mrf_download_error` |
| 23  | Russell Regional Hospital                                                                                      | unknown | —    | `mrf_download_error` |
| 325 | SCHWAB REHAB HOSPITAL AND CARE NETWORK                                                                         | unknown | —    | `mrf_download_error` |
| 236 | SMC Family Medicine                                                                                            | unknown | —    | `mrf_download_error` |
| 470 | STAT Emergency Center – Laredo South                                                                           | unknown | —    | `parse_error`        |
| 107 | STAT Specialty Hospital – Del Rio                                                                              | unknown | —    | `parse_error`        |
| 352 | STAT Specialty Hospital – Eagle Pass                                                                           | unknown | —    | `parse_error`        |
| 383 | STAT Specialty Hospital – Laredo North                                                                         | unknown | —    | `parse_error`        |
| 4   | SWIFT CREEK ER                                                                                                 | unknown | —    | `mrf_download_error` |
| 59  | Sage Rehab Hospital                                                                                            | unknown | —    | `parse_error`        |
| 146 | Sage Rehab Hospital                                                                                            | unknown | —    | `parse_error`        |
| 510 | Saint Vincent Hospital                                                                                         | unknown | —    | `mrf_download_error` |
| 41  | Salinas Valley Memorial Healthcare System                                                                      | unknown | —    | `parse_error`        |
| 525 | Samaritan Medical Center                                                                                       | unknown | —    | `mrf_download_error` |
| 6   | San Juan Regional Medical Center                                                                               | unknown | —    | `parse_error`        |
| 92  | SandyPines Residential Treatment Center                                                                        | unknown | —    | `parse_error`        |
| 60  | Santa Clara Valley Medical Center                                                                              | unknown | —    | `mrf_download_error` |
| 83  | Schuyler County Hospital District                                                                              | unknown | —    | `parse_error`        |
| 530 | Scotland County Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 463 | Scripps Green Hospital                                                                                         | unknown | —    | `mrf_download_error` |
| 587 | Scripps Memorial Hospital Encinitas                                                                            | unknown | —    | `mrf_download_error` |
| 592 | Scripps Memorial Hospital La Jolla                                                                             | unknown | —    | `mrf_download_error` |
| 386 | Scripps Mercy Hospital Chula Vista                                                                             | unknown | —    | `mrf_download_error` |
| 349 | Scripps Mercy Hospital San Diego                                                                               | unknown | —    | `mrf_download_error` |
| 454 | Select Specialty Hospital - Fort Smith                                                                         | unknown | —    | `parse_error`        |
| 507 | Select Specialty Hospital - Youngstown                                                                         | unknown | —    | `parse_error`        |
| 62  | Seymour Hospital                                                                                               | unknown | —    | `parse_error`        |
| 490 | Sheppard Pratt Health System                                                                                   | unknown | —    | `parse_error`        |
| 77  | Shoshone Medical Center                                                                                        | unknown | —    | `mrf_download_error` |
| 159 | Silver Oaks Behavioral Hospital                                                                                | unknown | —    | `parse_error`        |
| 527 | Sioux Falls Specialty Hospital                                                                                 | unknown | —    | `parse_error`        |
| 261 | Skagit Regional Health - Cascade Valley Hospital                                                               | unknown | —    | `mrf_download_error` |
| 114 | Skagit Regional Health - Skagit Valley Hospital                                                                | unknown | —    | `mrf_download_error` |
| 64  | Smokey Point Behavioral Hospital                                                                               | unknown | —    | `parse_error`        |
| 594 | Snoqualmie Valley Health                                                                                       | unknown | —    | `mrf_download_error` |
| 104 | Sojourn at Seneca                                                                                              | unknown | —    | `mrf_download_error` |
| 84  | South Coast Global Medical Center                                                                              | unknown | —    | `parse_error`        |
| 326 | South County Hospital                                                                                          | unknown | —    | `mrf_download_error` |
| 198 | South Lyon Medical Center                                                                                      | unknown | —    | `parse_error`        |
| 608 | South Miami Hospital                                                                                           | unknown | —    | `parse_error`        |
| 149 | South Mississippi Regional Medical Center                                                                      | unknown | —    | `parse_error`        |
| 38  | South Sound Behavioral Hospital                                                                                | unknown | —    | `parse_error`        |
| 478 | Southcoast Behavioral Health Hospital                                                                          | unknown | —    | `mrf_download_error` |
| 301 | Southwell Medical Center                                                                                       | unknown | —    | `parse_error`        |
| 448 | Springbrook Hospital                                                                                           | unknown | —    | `parse_error`        |
| 277 | St Luke Hospital                                                                                               | unknown | —    | `parse_error`        |
| 286 | St. Charles Bend                                                                                               | unknown | —    | `parse_error`        |
| 267 | St. Charles Madras                                                                                             | unknown | —    | `parse_error`        |
| 577 | St. Charles Prineville                                                                                         | unknown | —    | `parse_error`        |
| 395 | St. Charles Redmond                                                                                            | unknown | —    | `parse_error`        |
| 125 | St. Joseph Memorial Hospital                                                                                   | unknown | —    | `mrf_download_error` |
| 282 | St. Luke's Cornwall Hospital                                                                                   | unknown | —    | `mrf_download_error` |
| 540 | St. Luke's Cornwall Hospital - Cornwall Campus                                                                 | unknown | —    | `mrf_download_error` |
| 442 | St. Luke's Cornwall Hospital - Cornwall Woundcare                                                              | unknown | —    | `mrf_download_error` |
| 61  | St. Luke's Cornwall Hospital - Hospital Extension Clinic                                                       | unknown | —    | `mrf_download_error` |
| 486 | St. Luke's Cornwall Hospital - Hospital PT                                                                     | unknown | —    | `mrf_download_error` |
| 207 | St. Mary's Medical Center                                                                                      | unknown | —    | `mrf_download_error` |
| 548 | St. Raphael's Hospital                                                                                         | unknown | —    | `parse_error`        |
| 500 | St. Vincent's Birmingham                                                                                       | unknown | —    | `mrf_download_error` |
| 453 | St. Vincent's Blount                                                                                           | unknown | —    | `mrf_download_error` |
| 212 | St. Vincent's Chilton, LLC                                                                                     | unknown | —    | `mrf_download_error` |
| 619 | St. Vincent's East                                                                                             | unknown | —    | `mrf_download_error` |
| 88  | St. Vincent's St. Clair, LLC                                                                                   | unknown | —    | `mrf_download_error` |
| 403 | Stamford Hospital                                                                                              | unknown | —    | `parse_error`        |
| 569 | Stanislaus County Psychiatric Health Facility                                                                  | unknown | —    | `parse_error`        |
| 361 | Stephens Memorial Hospital                                                                                     | unknown | —    | `parse_error`        |
| 316 | Story County Medical Center                                                                                    | unknown | —    | `parse_error`        |
| 605 | Studer Family Children's Hospital Ascension Sacred Heart (Sacred Heart Health System, Inc.)                    | unknown | —    | `mrf_download_error` |
| 459 | Surgical Hospital at Southwoods                                                                                | unknown | —    | `parse_error`        |
| 268 | THE CHILDREN'S HOSPITAL AT TRISTAR CENTENNIAL                                                                  | unknown | —    | `mrf_download_error` |
| 309 | THE NEW LONDON HOSPITAL ASSOCIATION, INC.                                                                      | unknown | —    | `mrf_download_error` |
| 259 | TRISTAR CENTENNIAL PARTHEON PAVILION                                                                           | unknown | —    | `mrf_download_error` |
| 291 | Taylor Regional Hospital                                                                                       | unknown | —    | `mrf_download_error` |
| 484 | Telecare El Dorado County Psychiatric Health Facility                                                          | unknown | —    | `parse_error`        |
| 479 | Telecare Riverside Psychiatric Health Facility                                                                 | unknown | —    | `parse_error`        |
| 28  | Texas County Memorial Hospital                                                                                 | unknown | —    | `parse_error`        |
| 195 | Texas Health Seay Behavioral Health Center Plano                                                               | unknown | —    | `parse_error`        |
| 307 | The Unity Hospital of Rochester                                                                                | unknown | —    | `mrf_download_error` |
| 304 | The Western Pennsylvania Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 167 | Tift Regional Medical Center                                                                                   | unknown | —    | `parse_error`        |
| 99  | Totally Kids Rehabilitation Hospital                                                                           | unknown | —    | `mrf_download_error` |
| 367 | Touro                                                                                                          | unknown | —    | `parse_error`        |
| 310 | Tower Behavioral Health                                                                                        | unknown | —    | `mrf_download_error` |
| 131 | Tri-City Medical Center                                                                                        | unknown | —    | `mrf_download_error` |
| 375 | Tristar Spring Hill ER                                                                                         | unknown | —    | `mrf_download_error` |
| 45  | Troy Regional Medical Center                                                                                   | unknown | —    | `parse_error`        |
| 196 | TrustPoint Hospital                                                                                            | unknown | —    | `mrf_download_error` |
| 87  | UCHealth Memorial Hospital Central                                                                             | unknown | —    | `mrf_download_error` |
| 30  | UCHealth Memorial Hospital North                                                                               | unknown | —    | `mrf_download_error` |
| 377 | UCHealth Parkview Medical Center                                                                               | unknown | —    | `mrf_download_error` |
| 80  | UCHealth Parkview Pueblo West Hospital                                                                         | unknown | —    | `mrf_download_error` |
| 570 | UCI Health - Lakewood                                                                                          | unknown | —    | `mrf_download_error` |
| 96  | UCSF Langley Porter Psychiatric Hospital                                                                       | unknown | —    | `parse_error`        |
| 597 | UChicago Medicine AdventHealth GlenOaks                                                                        | unknown | —    | `parse_error`        |
| 397 | UMass Memorial Health-Milford Regional Medical Center                                                          | unknown | —    | `mrf_download_error` |
| 101 | UPMC Kane                                                                                                      | unknown | —    | `mrf_download_error` |
| 106 | UPMC Somerset                                                                                                  | unknown | —    | `mrf_download_error` |
| 90  | Union Hospital                                                                                                 | unknown | —    | `mrf_download_error` |
| 428 | Unity Medical Center                                                                                           | unknown | —    | `parse_error`        |
| 359 | UnityPoint Health - Allen Hospital                                                                             | unknown | —    | `mrf_download_error` |
| 599 | UnityPoint Health - Finley Hospital                                                                            | unknown | —    | `mrf_download_error` |
| 446 | UnityPoint Health - Grinnell Regional Medical Center                                                           | unknown | —    | `mrf_download_error` |
| 469 | UnityPoint Health - Iowa Lutheran Hospital                                                                     | unknown | —    | `mrf_download_error` |
| 364 | UnityPoint Health - Iowa Methodist Medical Center                                                              | unknown | —    | `mrf_download_error` |
| 203 | UnityPoint Health - Jones Regional Medical Center                                                              | unknown | —    | `mrf_download_error` |
| 206 | UnityPoint Health - Marshalltown                                                                               | unknown | —    | `mrf_download_error` |
| 511 | UnityPoint Health - Meriter Hospital                                                                           | unknown | —    | `mrf_download_error` |
| 481 | UnityPoint Health - St. Luke's Hospital                                                                        | unknown | —    | `mrf_download_error` |
| 138 | UnityPoint Health - St. Luke's Regional Medical Center                                                         | unknown | —    | `mrf_download_error` |
| 528 | UnityPoint Health - Trinity Bettendorf                                                                         | unknown | —    | `mrf_download_error` |
| 69  | UnityPoint Health - Trinity Muscatine                                                                          | unknown | —    | `mrf_download_error` |
| 458 | UnityPoint Health - Trinity Regional Medical Center                                                            | unknown | —    | `mrf_download_error` |
| 56  | University Hospitals Avon Rehabilitation Hospital                                                              | unknown | —    | `mrf_download_error` |
| 232 | University Medical Center                                                                                      | unknown | —    | `parse_error`        |
| 147 | University of Utah Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 199 | Valley Regional Hospital                                                                                       | unknown | —    | `parse_error`        |
| 35  | Valley View Hospital                                                                                           | unknown | —    | `mrf_download_error` |
| 110 | Valleywise Health Medical Center                                                                               | unknown | —    | `mrf_download_error` |
| 612 | Vanderbilt Bedford Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 589 | Vanderbilt Tullahoma-Harton Hospital                                                                           | unknown | —    | `mrf_download_error` |
| 392 | Vanderbilt University Medical Center                                                                           | unknown | —    | `mrf_download_error` |
| 404 | Vanderbilt Wilson County Hospital                                                                              | unknown | —    | `mrf_download_error` |
| 76  | Vantage Point Behavioral Health Hospital                                                                       | unknown | —    | `mrf_download_error` |
| 250 | Wabash General Hospital District                                                                               | unknown | —    | `parse_error`        |
| 197 | Wamego Health Center (Wamego Hospital Association)                                                             | unknown | —    | `mrf_download_error` |
| 243 | Washington County Hospital                                                                                     | unknown | —    | `parse_error`        |
| 451 | Washington Regional Medical Center                                                                             | unknown | —    | `mrf_download_error` |
| 40  | Webster County Memorial Hospital                                                                               | unknown | —    | `mrf_download_error` |
| 557 | Weirton Medical Center                                                                                         | unknown | —    | `parse_error`        |
| 542 | West Jefferson Medical Center                                                                                  | unknown | —    | `parse_error`        |
| 251 | West Kendall Baptist Hospital                                                                                  | unknown | —    | `parse_error`        |
| 252 | Westerly Hospital                                                                                              | unknown | —    | `parse_error`        |
| 71  | Westfield Memorial Hospital                                                                                    | unknown | —    | `mrf_download_error` |
| 238 | WhidbeyHealth                                                                                                  | unknown | —    | `parse_error`        |
| 571 | Williamson Medical Center                                                                                      | unknown | —    | `mrf_download_error` |
| 98  | Wilson Health                                                                                                  | unknown | —    | `mrf_download_error` |
| 230 | Windom Area Health                                                                                             | unknown | —    | `parse_error`        |
| 68  | Wiregrass Medical Center                                                                                       | unknown | —    | `mrf_download_error` |
| 217 | Wyckoff Heights Medical Center                                                                                 | unknown | —    | `parse_error`        |
| 598 | Yale New Haven Hospital                                                                                        | unknown | —    | `parse_error`        |
| 431 | Zachary-AMG Specialty Hospital                                                                                 | unknown | —    | `parse_error`        |
| 443 | allied services institute of rehabilitation                                                                    | unknown | —    | `parse_error`        |
| 271 | creekside behavioral health                                                                                    | unknown | —    | `parse_error`        |
| 545 | john heinz institute of rehabilitation                                                                         | unknown | —    | `parse_error`        |

## 5. Null-Location Providers (invisible to search)

**271 providers** exist in Supabase but have `lat = NULL` and `lng = NULL`.
These are **invisible to all distance-based searches** because PostGIS `ST_DWithin()` requires a non-null
geometry point.

**Root cause:** `geocodeByZip()` in `import-trilliant.ts` only extracts zip codes from the
`hospital_address` string. These hospitals had addresses without a parseable 5-digit zip.
The `hospital_city` and `hospital_state` fields were populated but never used for geocoding.

### Geocoding Improvement Opportunity

These providers could be fixed using `hospital_city + hospital_state` via the Google Maps
Geocoding API (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is already configured). Approach:

1. Query `providers WHERE lat IS NULL AND trilliant_hospital_id IS NOT NULL`
2. Geocode each via `{city}, {state}` → Google Maps Geocoding API → lat/lng
3. `UPDATE providers SET lat=?, lng=? WHERE id=?`

This is a separate task — not part of the NJ/PA reimport.

### Full Listing

| Name                                                                           | State   | City               | Address                                                                                                 | Trilliant ID |
| ------------------------------------------------------------------------------ | ------- | ------------------ | ------------------------------------------------------------------------------------------------------- | ------------ |
| Athens-Limestone Hospital                                                      | AL      | —                  | 700 W MARKET ST, Athens,AL 356112457                                                                    | 1621         |
| Washington County Hospital and Nursing Home                                    | AL      | —                  | 14600 St. Stephens Ave                                                                                  | 3124         |
| Love County Health Center                                                      | AR      | —                  | 300 Wanda St. Marietta OK 73448                                                                         | 754          |
| Mercy Hospital Ada                                                             | AR      | —                  | 701 N Johnson St Ada OK 74820                                                                           | 3358         |
| Mercy Hospital Ardmore                                                         | AR      | —                  | 1011 14th Avenue Northwest Ardmore OK 73401                                                             | 5273         |
| Mercy Hospital Aurora                                                          | AR      | —                  | 500 Porter Avenue Aurora MO 65605                                                                       | 5969         |
| Mercy Hospital Carthage                                                        | AR      | —                  | 3125 Dr. Russell Smith Way Carthage MO 64836                                                            | 2689         |
| Mercy Hospital Cassville                                                       | AR      | —                  | 94 Main St Cassville MO 65625                                                                           | 5776         |
| Mercy Hospital Columbus                                                        | AR      | —                  | 111 E Sycamore St Columbus KS 66725                                                                     | 4776         |
| Mercy Hospital Healdton                                                        | AR      | —                  | 3462 Hospital Road Healdton OK 73438                                                                    | 6007         |
| Mercy Hospital Jefferson                                                       | AR      | —                  | 1390 US Highway 61 Festus MO 6302                                                                       | 699          |
| Mercy Hospital Joplin                                                          | AR      | —                  | 100 Mercy Way Joplin MO 64804                                                                           | 2339         |
| Mercy Hospital Kingfisher                                                      | AR      | —                  | 1000 Hospital Drive Kingfisher OK 73750                                                                 | 725          |
| Mercy Hospital Lebanon                                                         | AR      | —                  | 100 Hospital Drive Lebanon MO 65536                                                                     | 1424         |
| Mercy Hospital Lincoln                                                         | AR      | —                  | 1000 E. Cherry Street Troy MO 63379                                                                     | 4142         |
| Mercy Hospital Logan County                                                    | AR      | —                  | 200 S. Academy Road Guthrie OK 73044                                                                    | 4098         |
| Mercy Hospital Oklahoma City                                                   | AR      | —                  | 4300 W. Memorial Road Oklahoma City OK 73120                                                            | 1510         |
| Mercy Hospital Perry                                                           | AR      | —                  | 210 Hospital Ln STE 203 Perryville MO 63775                                                             | 4805         |
| Mercy Hospital South                                                           | AR      | —                  | 10050 Kennerly Road Saint Louis MO 63128                                                                | 1975         |
| Mercy Hospital Springfield                                                     | AR      | —                  | 3231 S National Ave STE 440 Springfield MO 65807                                                        | 2666         |
| Mercy Hospital Tishomingo                                                      | AR      | —                  | 1000 S. Byrd Street Tishomingo OK 73460                                                                 | 1262         |
| Mercy Hospital Watonga                                                         | AR      | —                  | 500 N. Clarence Nash Boulevard Watonga OK 73772                                                         | 5371         |
| Mercy Orthopedic Hospital Springfield                                          | AR      | —                  | 3050 E River Bluff Blvd Ozark MO 65721                                                                  | 2706         |
| Mercy Specialty Hospital - Southeast Kansas                                    | AR      | —                  | 198 Four States Dr STE 10 Galena KS 66739                                                               | 5521         |
| Mercy St Francis Hospital                                                      | AR      | —                  | 100 W. US Highway 60 Mountain View MO 65548                                                             | 4921         |
| Stone County Medical Center                                                    | AR      | —                  | N/A                                                                                                     | 979          |
| White River Medical Center                                                     | AR      | —                  | N/A                                                                                                     | 2246         |
| Amarillo Surgical and Endoscopy                                                | CA      | —                  | 1 Care Circle, Amarillo TX 79124                                                                        | 2340         |
| Children's Hospital of Orange County                                           | CA      | —                  | 1201 W La Veta Ave                                                                                      | 5601         |
| CHOC at Mission Hospital                                                       | CA      | —                  | 27700 Medical Center Rd                                                                                 | 4100         |
| Community Memorial Healthcare - Ojai                                           | CA      | —                  | 1306 Maricopa Highway                                                                                   | 2707         |
| Doctors Hospital of Riverside                                                  | CA      | —                  | 3865 Jackson Street                                                                                     | 4938         |
| Garfield Medical Center                                                        | CA      | —                  | 525 N Garfield Ave                                                                                      | 5400         |
| Generations Behavioral Health Geneva                                           | CA      | —                  | 60 West Street Geneva OH 44041                                                                          | 4689         |
| Genesis Hospital                                                               | CA      | —                  | 2951 Maple Ave, Zanesville, Ohio 43701                                                                  | 1537         |
| Hospital Authority of Jefferson County and the City of Louisville dba          | CA      | —                  | 1067 Peachtree Street, Louisville, Georgia 30434                                                        | 1557         |
| Kingsbrook Jewish Medical Center                                               | CA      | —                  | 585 Schenectady Avenue Brooklyn NY 11203                                                                | 4276         |
| Los Angeles Downtown Medical Center                                            | CA      | —                  | 1711 W TEMPLE STREET SUITE 8135                                                                         | 5618         |
| Moanalua Medical Center                                                        | CA      | HONOLULU           | 3288 MOANALUA ROAD, HONOLULU, HAWAII 96819                                                              | 700          |
| Monterey Park Hospital                                                         | CA      | —                  | 900 S Atlantic Blvd                                                                                     | 1831         |
| Sherman Oaks Hospital                                                          | CA      | —                  | 4929 Van Nuys Boulevard Sherman Oaks, CA91403                                                           | 4558         |
| Whittier Hospital Medical Center                                               | CA      | —                  | 9080 Colima Road                                                                                        | 1140         |
| Woman's Hospital                                                               | CA      | —                  | 100 Woman's Way Baton Rouge, La 70817                                                                   | 2684         |
| Baxter Health                                                                  | CO      | —                  | TBD                                                                                                     | 5949         |
| Cookeville Regional Medical Center                                             | CO      | —                  | 1 Medical Center Blvd Cookeville 38501                                                                  | 5525         |
| Fulton County Medical Center                                                   | CO      | —                  | 214 Peach  Orchard Rd Mc Connellsburg PA                                                                | 1707         |
| Lake Cumberland Regional Hospital                                              | CO      | —                  | 305 Langdon Steet Somerset KY 42503                                                                     | 3754         |
| USC Arcadia Hospital                                                           | CO      | —                  | 300 W Huntington Drive Arcadia CA 91006                                                                 | 3311         |
| Warren Medical Group                                                           | CO      | —                  | TBD                                                                                                     | 4288         |
| Wayne Memorial Hospital                                                        | CO      | —                  | 601 Park Street Honesdale PA 18431                                                                      | 5258         |
| Doctors' Center Hospital - San Fernando de la Carolina                         | DE      | Carolina           | Edificio Jesús T. Piñeiro, Apartado 8, Carolina, PR 00986                                               | 5211         |
| NEMOURS CHILDREN'S HOSPITAL                                                    | FL      | —                  | 6535 Nemours Parkway                                                                                    | 1849         |
| PAM Health Specialty Hospital of Shreveport                                    | FL      | FL 10 Shreveport   | 1541 Kings Highway, FL 10 Shreveport, LA 71103                                                          | 5312         |
| Emanuel Medical Center                                                         | GA      | —                  | N/A                                                                                                     | 3137         |
| Jasper Memorial Hospital                                                       | GA      | —                  | N/A                                                                                                     | 4517         |
| Landmark Hospital of Savannah                                                  | GA      | —                  | 800 East 68th St. Savannah, GA 3                                                                        | 689          |
| Tanner Medical Center/Carrollton                                               | GA      | —                  | 705 Dixie Highway                                                                                       | 3753         |
| Wayne Memorial Hospital                                                        | GA      | —                  | N/A                                                                                                     | 6024         |
| Kohala Hospital                                                                | HI      | —                  | 54-383 Hospital Rd                                                                                      | 1114         |
| Kona Community Hospital                                                        | HI      | —                  | 79-1019 Haukapila St                                                                                    | 5688         |
| Leahi Hospital                                                                 | HI      | —                  | 3675 Kilauea Avenue                                                                                     | 3228         |
| Cascade Medical Center                                                         | ID      | —                  | N/A                                                                                                     | 2837         |
| RCG Taft Street                                                                | IN      | —                  | 8555 Taft St                                                                                            | 4705         |
| Goodland Regional Medical Center                                               | KS      | —                  | N/A                                                                                                     | 1742         |
| Greeley County Health Services, Inc.                                           | KS      | —                  | 506 3rd Street                                                                                          | 1835         |
| Rawlins County Health Center                                                   | KS      | —                  | N/A                                                                                                     | 2588         |
| Hocking Valley Community Hospital                                              | KY      | —                  | 601 OH-664 N Logan OH 43138                                                                             | 3176         |
| Abbeville General Hospital                                                     | LA      | —                  | 118 North Hospital Drive                                                                                | 5707         |
| Baton Rouge General - Ascension                                                | LA      | —                  | 3600 FLORIDA BLVD, BATON ROUGE,LA 708063842                                                             | 3045         |
| Baton Rouge General - Bluebonnet                                               | LA      | —                  | 3600 FLORIDA BLVD, BATON ROUGE,LA 708063842                                                             | 1345         |
| Baton Rouge General - Mid City                                                 | LA      | —                  | 3600 FLORIDA BLVD, BATON ROUGE,LA 708063842                                                             | 5911         |
| Oceans Behavioral Hospital Permian Basin                                       | LA      | —                  | 3300 South FM 1788; Midland, LA 79706                                                                   | 1471         |
| Boston Children's Lexington                                                    | MA      | —                  | 482 Bedford Street Lexington, MA 02173                                                                  | 2077         |
| North Oaks Medical Center                                                      | MD      | Drive. Hammond     | 15790 Paul Vega, MD, Drive. Hammond, LA 70403                                                           | 2617         |
| Little Falls Hospital                                                          | ME      | —                  | 140 Burwell Street, Little Falls NY 13365                                                               | 1784         |
| O'Connor Hospital                                                              | ME      | —                  | 460 Andes Road, Delhi NY 13753                                                                          | 896          |
| Harbor Beach Community Hospital                                                | MI      | —                  | 210_S_1st_Street_Harbor_Beach_MI_48441                                                                  | 3881         |
| McKenzie Health System                                                         | MI      | —                  | 120_N.\_Delaware_St_Sandusky_MI_48471                                                                   | 3173         |
| ProMedica Charles and Virginia Hickman Hospital                                | MI      | —                  | 5640 N Adrian Hwy                                                                                       | 1012         |
| ProMedica Coldwater Regional Hospital                                          | MI      | —                  | 274 E Chicago St                                                                                        | 5240         |
| ProMedica Monroe Regional Hospital                                             | MI      | —                  | 718 N. Macomb St.                                                                                       | 3344         |
| Allina Health Faribault Medical Center                                         | MN      | —                  | 200 St Ave.                                                                                             | 5722         |
| Buffalo Hospital                                                               | MN      | —                  | 303 Caitlin St                                                                                          | 1850         |
| Cambridge Medical Center                                                       | MN      | —                  | 701 Dellwood St S                                                                                       | 2206         |
| Owatonna Hospital                                                              | MN      | —                  | 2250 26th St NW,                                                                                        | 3572         |
| River Falls Area Hospital                                                      | MN      | —                  | 1617 E Division St                                                                                      | 1987         |
| Washington County Memorial Hospital                                            | MO      | —                  | 300 HEALTH WAY DR                                                                                       | 3103         |
| Oceans Behavioral Hospital Biloxi                                              | MS      | —                  | 180C Debuys Road; Biloxi, MS 39351                                                                      | 4054         |
| Carrollton Springs                                                             | NC      | —                  | 2225 Parker Rd Carrollton TX 75010                                                                      | 712          |
| Novant Health Ballantyne Medical Center                                        | NC      | —                  | 10905_Providence_Rd_West_Charlotte_NC_28277                                                             | 5876         |
| Novant Health Brunswick Medical Center                                         | NC      | —                  | 240_Hospital_Drive_NE_Bolivia_NC_28422                                                                  | 4866         |
| Novant Health Charlotte Orthopedic Hospital                                    | NC      | —                  | 1901_Randolph_Rd.\_Charlotte_NC_28207                                                                   | 3930         |
| Novant Health Clemmons Medical Center                                          | NC      | —                  | 6915_Village_Medical_Circle_Clemmons_NC_27012                                                           | 1982         |
| Novant Health Forsyth Medical Center                                           | NC      | —                  | 3333_Silas_Creek_Pkwy_Winston_Salem_NC_27103                                                            | 4729         |
| Novant Health Huntersville Medical Center                                      | NC      | —                  | 10030_Gilead_Road_Huntersville_NC_28078                                                                 | 3776         |
| Novant Health Kernersville Medical Center                                      | NC      | —                  | 1750_Kernersville_Medical_Parkway_Kernersville_NC_27284                                                 | 2614         |
| Novant Health Matthews Medical Center                                          | NC      | —                  | 1500_Matthews_Township_Pkwy_Matthews_NC_28105                                                           | 4169         |
| Novant Health Medical Park Hospital                                            | NC      | —                  | 1950_South_Hawthorne_Rd_Winston_Salem_NC27103                                                           | 1749         |
| Novant Health Mint Hill Medical Center                                         | NC      | —                  | 8201_Healthcare_Loop_Charlotte_NC_28215                                                                 | 2990         |
| Novant Health New Hanover Regional Medical Center                              | NC      | —                  | 2131_S_17th_St_Wilmington_NC_28401                                                                      | 3553         |
| Novant Health Pender Medical Center                                            | NC      | —                  | 507_E_Fremont_St_Burgaw_NC_28425                                                                        | 3024         |
| Novant Health Presbyterian Medical Center                                      | NC      | —                  | 200_Hawthorne_Lane_Charlotte_NC_28204                                                                   | 5915         |
| Novant Health Rowan Medical Center                                             | NC      | —                  | 612_Mocksville_Avenue_Salisbury_NC_28144                                                                | 5552         |
| Novant Health Thomasville Medical Center                                       | NC      | —                  | 207_Old_Lexington_Rd.\_Thomasville_NC_27360                                                             | 2180         |
| Encompass Health Rehabilitation Hospital of Albuquerque                        | NE      | Albuquerque        | 7000 Jefferson St., NE, Albuquerque, NM 87109-4313                                                      | 5448         |
| Atlantic Rehabilitation Institute                                              | NJ      | —                  | 200 Madison Avenue Madison NJ 7940                                                                      | 3412         |
| Virtua Marlton Hospital                                                        | NJ      | —                  | 90_Brick_Road_Marlton_NJ_08053                                                                          | 4372         |
| Virtua Mount Holly Hospital                                                    | NJ      | —                  | 175_Madison_Avenue_Mount_Holly_NJ_08060                                                                 | 5558         |
| Virtua Our Lady of Lourdes Hospital                                            | NJ      | —                  | 1600_Haddon_Avenue_Camden_NJ_08103                                                                      | 2238         |
| Virtua Voorhees Hospital                                                       | NJ      | —                  | 100_Bowman_Drive_Voorhees_NJ_08043                                                                      | 1771         |
| Virtua Willingboro Hospital                                                    | NJ      | —                  | 218A_Sunset_Road_Willingboro_NJ_08046                                                                   | 5712         |
| Miners Colfax Medical Center                                                   | NM      | —                  | 203 Hospital Dr                                                                                         | 4381         |
| Claxton Hepburn Medical Center                                                 | NY      | —                  | 214 King St Ogdensburg, NY                                                                              | 3433         |
| Los Alamos Medical Center                                                      | NY      | —                  | 3917 West Road Los Alamos NM 87544                                                                      | 1273         |
| Brunswick Medical Center & Emergency Room                                      | OH      | Middleburg Heights | 18697 Bagley Rd, Middleburg Heights, OH                                                                 | 2595         |
| Institute for Orthopaedic Surgery                                              | OH      | —                  | 801 Medical Drive, Suite B                                                                              | 931          |
| Margaret Mary Health                                                           | OH      | —                  | 321 Mitchell Avenue                                                                                     | 1827         |
| ProMedica Bay Park Hospital                                                    | OH      | —                  | 2801 Bay Park Dr                                                                                        | 1623         |
| ProMedica Defiance Regional Hospital                                           | OH      | —                  | 1200 Ralston Ave                                                                                        | 4723         |
| ProMedica Fostoria Community Hospital                                          | OH      | —                  | 501 Van Buren St                                                                                        | 3845         |
| ProMedica Memorial Hospital                                                    | OH      | —                  | 715 S. Taft Ave.                                                                                        | 5388         |
| Southwest General Health Center                                                | OH      | Middleburg Heights | 18697 Bagley Rd, Middleburg Heights, OH                                                                 | 5678         |
| Oregon Health and Science University                                           | OR      | —                  | 3181 S.W. SAM JACKSON PARK RD., PORTLAND,OR 972393098                                                   | 4395         |
| Haven Behavioral Hospital of Philadelphia                                      | PA      | —                  | 3300 Henry Avenue                                                                                       | 5390         |
| Heritage Valley Beaver                                                         | PA      | —                  | 1000 Dutch Ridge Road, BEAVER,PA 150099727                                                              | 1255         |
| Heritage Valley Kennedy                                                        | PA      | —                  | 720 BLACKBURN RD, SEWICKLEY,PA 151431459                                                                | 1580         |
| Heritage Valley Sewickley                                                      | PA      | —                  | 720 BLACKBURN RD, SEWICKLEY,PA 151431459                                                                | 3524         |
| UPMC Green                                                                     | PA      | —                  | 250 Bonor Avenue Waynesburg, PA                                                                         | 4663         |
| UPMC Green                                                                     | PA      | —                  | 250 Bonor Avenue Waynesburg, PA                                                                         | 5814         |
| UPMC Washington                                                                | PA      | —                  | 155 Wilson Avenue Washington, PA                                                                        | 1740         |
| UPMC Washington                                                                | PA      | —                  | 155 Wilson Avenue Washington, PA                                                                        | 2922         |
| Warren General Hospital                                                        | PA      | —                  | 2 Crescent Park West Warren PA                                                                          | 4177         |
| Charleston-AMG Specialty Hospital                                              | SC      | —                  | 1200 Hospital Drive                                                                                     | 5751         |
| Weston County Health Services                                                  | SD      | —                  | "1124 Washington Blvd, Newcastle WY, 82701"                                                             | 4058         |
| Ascension Saint Thomas Three Rivers                                            | TN      | —                  | 451 Highway 13 S Waverly TN                                                                             | 1875         |
| WTH Camden Hospital                                                            | TN      | —                  | 175 Hospital Dr                                                                                         | 1019         |
| WTH Dyersburg Hospital                                                         | TN      | —                  | 400 E Tickle St                                                                                         | 5355         |
| WTH Volunteer Hospital                                                         | TN      | —                  | 161 Mt Pelia Rd                                                                                         | 4155         |
| BAYLOR SCOTT & WHITE MEDICAL CENTER - LAKEWAY                                  | TX      | Lakeway            | 100 Medical Parkway, Lakeway, TX                                                                        | 2948         |
| BAYLOR SCOTT & WHITE PAVILION - TEMPLE                                         | TX      | —                  | TX                                                                                                      | 1402         |
| Eagle Lake                                                                     | TX      | —                  | Austin Road                                                                                             | 4391         |
| Faith Community Hospital                                                       | TX      | —                  | N/A                                                                                                     | 653          |
| Hamilton General Hospital                                                      | TX      | —                  | North Brown Street                                                                                      | 1848         |
| Heart of Texas Healthcare System                                               | TX      | —                  | Brady, TX                                                                                               | 1183         |
| Limestone Medical Center                                                       | TX      | —                  | N/A                                                                                                     | 4687         |
| Rice Medical Center                                                            | TX      | —                  | Austin Road                                                                                             | 4669         |
| Springfield Behavioral Hospital, LLC                                           | TX      | —                  | 2828 North National Avenue, Springfield MO 65803                                                        | 5546         |
| Warm Springs Rehabilitation Center Lockhart                                    | TX      | —                  | 1710 S. Colorado Street, Suite 102                                                                      | 3784         |
| Allen County Regional Hospital                                                 | UNKNOWN | —                  | 3066 North. Kentucky Street                                                                             | 2038         |
| Anderson County Hospital                                                       | UNKNOWN | —                  | 421 S Maple Steet P O Box 30909                                                                         | 3508         |
| Auburn Community Hospital                                                      | UNKNOWN | —                  | []                                                                                                      | 3020         |
| Baptist & Wolfson St Augustine Emergency Room                                  | UNKNOWN | ST AUGUSTINE       | 461 Outlet Mall Blvd., ST AUGUSTINE, FL, 32084                                                          | 5085         |
| BEAR VALLEY COMMUNITY HOSPITAL                                                 | UNKNOWN | Big Bear Lake      | 41870 Garstin Drive, PO Box 1649, Big Bear Lake, CA, 92315-1649                                         | 1731         |
| CHP-LVHN JV, LLC d/b/a Lehigh Valley Hospital - Gilbertsville                  | UNKNOWN | —                  | 1109 Grosser Rd, Gilbertsville PA 19525                                                                 | 1010         |
| CHP-LVHN JV, LLC d/b/a Lehigh Valley Hospital - Macungie                       | UNKNOWN | —                  | 3369 Route 100, Macungie PA 18062                                                                       | 3416         |
| Clay County Medical Corporation                                                | UNKNOWN | —                  | []                                                                                                      | 5644         |
| Cleveland Area Hospital                                                        | UNKNOWN | —                  | []                                                                                                      | 4764         |
| Community Hospital of Anaconda                                                 | UNKNOWN | —                  | 401 W Pennsylvania St Anaconda MT 59711                                                                 | 2850         |
| Coquille Valley Hospital                                                       | UNKNOWN | —                  | []                                                                                                      | 5926         |
| Crittenden Community Hospital                                                  | UNKNOWN | —                  | 520 W Gum St Marion Ky 42064                                                                            | 4809         |
| David H. Koch Center for Cancer Care at Memorial Sloan Kettering Cancer Center | UNKNOWN | —                  | 530 East 74th Street New York NY 10021                                                                  | 2278         |
| DEL SOL REHAB                                                                  | UNKNOWN | EL PASO            | 1395 George Dieter Drive, EL PASO, TX, 79936                                                            | 1293         |
| Delta County Memorial Hospital                                                 | UNKNOWN | —                  | []                                                                                                      | 1404         |
| Doctors' Center Hospital - Bayamón                                             | UNKNOWN | Bayamon            | Urb. Hermanas Dávila, Calle J #9, Bayamon, PR 00960                                                     | 1466         |
| Doctors' Center Hospital - Dorado                                              | UNKNOWN | Dorado             | 900 carretera 696, Dorado, PR 00646                                                                     | 1671         |
| Doctors' Center Hospital - Manatí                                              | UNKNOWN | Manatí             | Carr #2 Km 47.7, Manatí, PR 00674                                                                       | 3201         |
| Doctors' Center Hospital - San Juan                                            | UNKNOWN | Santurce           | Calle San Rafael #1395, Santurce, PR 00909                                                              | 2166         |
| Doctors’ Hospital of Williamsburg                                              | UNKNOWN | —                  | 1500 Commonwealth Avenue, Williamsburg, Virginia 23185                                                  | 4751         |
| Easton Avenue                                                                  | UNKNOWN | —                  | []                                                                                                      | 1698         |
| Encompass Health Rehabilitation Hospital of Manati                             | UNKNOWN | Manati             | Carretera #2, Kilometro 47.7, Manati, PR 00674                                                          | 1068         |
| Encompass Health Rehabilitation Hospital of San Juan                           | UNKNOWN | San Juan           | 3rd. Floor, University Hospital, Medical Center, San Juan, PR 00936-8344                                | 2068         |
| Evelyn H. Lauder Breast Center                                                 | UNKNOWN | —                  | 300 East 66th Street Floors 1 - 4 New York NY 10065                                                     | 4044         |
| Fairfield Medical Center                                                       | UNKNOWN | —                  | 401 N Ewing St, Lancaster, Ohio 43130                                                                   | 4525         |
| Flushing Hospital Medical Center                                               | UNKNOWN | —                  | 4500 Parsons Blvd,Flushing,NY,11355                                                                     | 3894         |
| HCA FLORIDA FORT WALTON-DESTIN HOSPITAL                                        | UNKNOWN | FT WALTON BEACH    | 1000 MAR-WALT DRIVE, FT WALTON BEACH, FL, 32547                                                         | 1360         |
| HCA FLORIDA NORTHSIDE HOSPITAL                                                 | UNKNOWN | ST PETERSBURG      | 6000 49TH STREET NORTH, ST PETERSBURG, FL, 33709                                                        | 6019         |
| Hedrick Medical Center                                                         | UNKNOWN | —                  | 2799 North Washington Street                                                                            | 5621         |
| Jamaica Hospital Medical Center                                                | UNKNOWN | —                  | 8900 Van Wyck Expy,Jamaica,NY,11418                                                                     | 4714         |
| John H. Stroger Jr. Hospital                                                   | UNKNOWN | —                  | []                                                                                                      | 5182         |
| Josie Robertson Surgery Center                                                 | UNKNOWN | —                  | 1133 York Avenue New York NY 10065                                                                      | 3575         |
| Kell West Regional Hospital                                                    | UNKNOWN | —                  | []                                                                                                      | 5863         |
| Macon Community Hospital                                                       | UNKNOWN | —                  | []                                                                                                      | 4324         |
| Marion Regional Medical Center, Inc.                                           | UNKNOWN | —                  | []                                                                                                      | 3044         |
| McGehee Hospital                                                               | UNKNOWN | PO BOX 351         | 900 S 3RD, PO BOX 351, MCGEHEE, AR, 716542562\|1507 SOUTH FIRST STREET, P O Box 351, MCGEHEE, AR, 71654 | 3241         |
| Medical Behavioral Hospital of Clear Lake, LLC                                 | UNKNOWN | —                  | []                                                                                                      | 855          |
| MEDICAL CITY ER WHITE SETTLEMENT                                               | UNKNOWN | FORT WORTH         | 9650 WHITE SETTLEMENT RD, FORT WORTH, TX, 76108                                                         | 2547         |
| MEDICAL CITY FORT WORTH HOSPITAL                                               | UNKNOWN | FT WORTH           | 900 EIGHTH AVENUE, FT WORTH, TX, 76104                                                                  | 2504         |
| MEDICAL CITY SURGICAL HOSPITAL ALLIANCE                                        | UNKNOWN | FT WORTH           | 3200 N TARRANT PARKWAY, FT WORTH, TX, 76177                                                             | 630          |
| MedStar Washington Hospital Center                                             | UNKNOWN | —                  | 110 Irving Street, NW, Washington DC, 20010                                                             | 850          |
| Memorial Sloan Kettering 64th Street Outpatient Center                         | UNKNOWN | —                  | 205 East 64th Street New York NY 10065                                                                  | 3583         |
| Memorial Sloan Kettering Basking Ridge                                         | UNKNOWN | —                  | 136 Mountain View Boulevard Basking Ridge NJ 07920                                                      | 1943         |
| Memorial Sloan Kettering Bergen                                                | UNKNOWN | —                  | 225 Summit Avenue Montvale NJ 07645                                                                     | 1830         |
| Memorial Sloan Kettering Brooklyn Infusion Center                              | UNKNOWN | —                  | 557 Atlantic Avenue Brooklyn NY 11217                                                                   | 5492         |
| Memorial Sloan Kettering Cancer Center                                         | UNKNOWN | —                  | 1275 York Avenue, New York, New York 10065                                                              | 1723         |
| Memorial Sloan Kettering Commack Nonna’s Garden Foundation Center              | UNKNOWN | —                  | 500 Westchester Avenue West Harrison NY 10604                                                           | 1748         |
| Memorial Sloan Kettering Counseling Center                                     | UNKNOWN | —                  | 160 East 53rd Street New York NY 10022                                                                  | 2086         |
| Memorial Sloan Kettering Imaging Center                                        | UNKNOWN | —                  | 300 East 66th Street Floors 5 - 6 New York NY 10065                                                     | 1079         |
| Memorial Sloan Kettering Monmouth                                              | UNKNOWN | —                  | 480 Red Hill Road Middletown NJ 07748                                                                   | 5290         |
| Memorial Sloan Kettering Nassau                                                | UNKNOWN | —                  | 1101 Hempstead Turnpike Uniondale NY 11553                                                              | 5330         |
| Memorial Sloan Kettering Skin Cancer Center Hauppauge                          | UNKNOWN | —                  | 800 Veterans Memorial Highway 2nd Floor Hauppauge NY 11788                                              | 5577         |
| Memorial Sloan Kettering Westchester                                           | UNKNOWN | —                  | 500 Westchester Avenue West Harrison NY 10604                                                           | 4836         |
| Mercy Medical Center                                                           | UNKNOWN | —                  | 1325 N. Highland, Aurora, Illinois 60506                                                                | 2274         |
| Mizell Memorial Hospital                                                       | UNKNOWN | Opp                | 702 N Main St, PO Box 1010, Opp, AL, 36467                                                              | 920          |
| Moffitt Cancer Center                                                          | UNKNOWN | —                  | 12902 Magnolia Dr, Tampa, Florida, 33612                                                                | 4688         |
| Monroe Health Services, Inc.                                                   | UNKNOWN | —                  | []                                                                                                      | 4418         |
| MSK Ralph Lauren Center                                                        | UNKNOWN | —                  | 1919 Madison Avenue (Entrance on 124th Street) New York NY 10035                                        | 3735         |
| Nationwide Children's Hospital Toledo                                          | UNKNOWN | —                  | 2213 Cherry Street, Toledo OH 43608                                                                     | 5789         |
| Neosho Memorial Regional Medical Center                                        | UNKNOWN | —                  | []                                                                                                      | 3437         |
| NewYork-Presbyterian Brooklyn Methodist Hospital                               | UNKNOWN | —                  | 506 Sixth Street Brooklyn NY 11215                                                                      | 5720         |
| NewYork-Presbyterian Columbia University Irving Medical Center                 | UNKNOWN | —                  | 622 West 168th Street New York NY 10032                                                                 | 4724         |
| NewYork-Presbyterian Hudson Valley Hospital                                    | UNKNOWN | —                  | 1980 Crompond Road Cortlandt Manor NY 10567                                                             | 2418         |
| NewYork-Presbyterian Lower Manhattan Hospital                                  | UNKNOWN | —                  | 170 William Street New York NY 10038                                                                    | 4466         |
| NewYork-Presbyterian Queens                                                    | UNKNOWN | —                  | 56-45 Main Street Flushing NY 11355                                                                     | 3827         |
| NewYork-Presbyterian Weill Cornell Medical Center                              | UNKNOWN | —                  | 525 East 68th Street New York NY 10021                                                                  | 2515         |
| NewYork-Presbyterian Westchester                                               | UNKNOWN | —                  | 55 Palmer Avenue Bronxville NY 10708                                                                    | 910          |
| NewYork-Presbyterian Westchester Behavioral Health                             | UNKNOWN | —                  | 21 Bloomingdale Road White Plains NY 10605                                                              | 3435         |
| North Mississippi Medical Center, Inc.                                         | UNKNOWN | —                  | []                                                                                                      | 5671         |
| Norton Scott Hospital                                                          | UNKNOWN | —                  | Norton Scott Hospital                                                                                   | 3991         |
| Norton West Louisville Hospital                                                | UNKNOWN | —                  | Norton West Louisville Hospital                                                                         | 3740         |
| Oceans Behavioral Hospital Hammond                                             | UNKNOWN | —                  | 921 Ave G: Kentwood; LA 70444                                                                           | 4524         |
| Oceans Behavioral Hospital Kentwood                                            | UNKNOWN | —                  | 921 Ave G: Kentwood; LA 70444                                                                           | 2392         |
| Parkland Health                                                                | UNKNOWN | —                  | []                                                                                                      | 4073         |
| Peconic Bay Medical Center                                                     | UNKNOWN | —                  | 1300 Roanoke Ave, Riverhead, New York 11901                                                             | 1450         |
| Penobscot Valley Hospital                                                      | UNKNOWN | Lincoln            | 7 Transalpine Rd, PO Box 368, Lincoln, ME, 04457                                                        | 3013         |
| Phillips County Hospital                                                       | UNKNOWN | PO BOX 640         | 311 S 8TH AVE E, PO BOX 640, MALTA, MT, 59538-0640                                                      | 3249         |
| Pontotoc Health Services, Inc.                                                 | UNKNOWN | —                  | []                                                                                                      | 1901         |
| Provident Hospital Cook County                                                 | UNKNOWN | —                  | []                                                                                                      | 3400         |
| Riverside Hospital, Inc.                                                       | UNKNOWN | —                  | 500 J. Clyde Morris Boulevard, Newport News, Virginia 23601                                             | 1882         |
| Riverside Middle Peninsula Hospital, Inc.                                      | UNKNOWN | —                  | 7519 Hospital Drive, Gloucester, Virginia 23061                                                         | 5809         |
| Rockefeller Outpatient Pavilion                                                | UNKNOWN | —                  | 160 East 53rd Street New York NY 10022                                                                  | 1845         |
| Rothman Orthopaedic Specialty Hospital                                         | UNKNOWN | —                  | 3300 Tillman Dr                                                                                         | 1729         |
| Rural Wellness Anadarko                                                        | UNKNOWN | —                  | 1002 E Central Blvd Anadarko OK. 73005                                                                  | 774          |
| Rural Wellness Fairfax                                                         | UNKNOWN | —                  | 40 Hospital Rd                                                                                          | 2823         |
| Rural Wellness Stroud                                                          | UNKNOWN | —                  | 2308 OK-66 Stroud, OK. 74079                                                                            | 4604         |
| Saint Francis Hospital                                                         | UNKNOWN | —                  | 355 Ridge Ave., Evanston, Illinois 60202                                                                | 1423         |
| Saint Joseph Hospital                                                          | UNKNOWN | —                  | 77 N. Airlite St., Elgin, Illinois 60123                                                                | 1603         |
| Saint Joseph Medical Center                                                    | UNKNOWN | —                  | 333 Madison St., Joliet, Illinois 60435                                                                 | 1883         |
| Saint Luke's East Hospital                                                     | UNKNOWN | —                  | 100 N.E. Saint Luke's Boulevard                                                                         | 3094         |
| Saint Luke's Hospital of Kansas City                                           | UNKNOWN | —                  | 4401 Wornall Road,Kansas City MO 64111                                                                  | 1670         |
| Saint Luke's North Hospital                                                    | UNKNOWN | —                  | 5830 NW Barry Road                                                                                      | 1587         |
| Saint Luke’s North Hospital – Smithville                                       | UNKNOWN | —                  | 601 South 169 Highway, Smithville MO 64089                                                              | 1482         |
| Saint Luke's South Hospital                                                    | UNKNOWN | —                  | 12300 Metcalf Avenue                                                                                    | 2964         |
| Saint Mary of Nazareth Hospital                                                | UNKNOWN | —                  | 2233 W. Division St., Chicago, Illinois 60622                                                           | 5892         |
| Scott County Hospital                                                          | UNKNOWN | —                  | 201 Albert Avenue Scott City, Kansas 67871                                                              | 3065         |
| Shore Health Services, Inc.                                                    | UNKNOWN | —                  | 20480 Market Street, Onancock, Virginia 23417                                                           | 1154         |
| Sidney Kimmel Center for Prostate and Urologic Cancers                         | UNKNOWN | —                  | 353 East 68th Street New York NY 10065                                                                  | 2851         |
| Sisters of Charity Hospital                                                    | UNKNOWN | —                  | 2157 Main Street, Buffalo, New York 14214                                                               | 3075         |
| Sisters of Charity Hospital - St. Joseph Campus                                | UNKNOWN | —                  | 2605 Harlem Road, Cheektowaga, New York 14225                                                           | 2570         |
| Springhill Medical Center                                                      | UNKNOWN | Springhill         | 2001 Doctors Drive, PO Box 920, Springhill, LA, 71075                                                   | 4646         |
| St. Luke's Hospital                                                            | UNKNOWN | PO BOX 10          | 702 1ST ST SW, PO BOX 10, CROSBY, ND, 58730                                                             | 2763         |
| St. Mary’s Hospital                                                            | UNKNOWN | —                  | 500 W. Court St., Kankakee, Illinois 60901                                                              | 4456         |
| Surgical Specialty Center of Baton Rouge                                       | UNKNOWN | —                  | []                                                                                                      | 3682         |
| The Hospital at Westlake Medical Center                                        | UNKNOWN | —                  | []                                                                                                      | 1869         |
| Tishomingo Health Services, Inc.                                               | UNKNOWN | —                  | []                                                                                                      | 2070         |
| UAB St. Vincent's Blount                                                       | UNKNOWN | —                  | []                                                                                                      | 5736         |
| UAB St. Vincent's Chilton                                                      | UNKNOWN | —                  | []                                                                                                      | 1860         |
| UAB St. Vincent's East                                                         | UNKNOWN | —                  | []                                                                                                      | 1399         |
| UMMC Grenada Hospital                                                          | UNKNOWN | —                  | []                                                                                                      | 2612         |
| UMMC Holmes County Hospital                                                    | UNKNOWN | —                  | []                                                                                                      | 4848         |
| UMMC Jackson Hospital                                                          | UNKNOWN | —                  | []                                                                                                      | 2003         |
| UMMC Madison Hospital                                                          | UNKNOWN | —                  | []                                                                                                      | 2613         |
| VCU Community Memorial Hospital                                                | UNKNOWN | —                  | 1755 North Mecklenburg Avenue, South Hill VA, 23970                                                     | 5541         |
| VCU Medical Center                                                             | UNKNOWN | —                  | 1250 East Marshall Street, Richmond VA                                                                  | 3819         |
| Vista Medical Center                                                           | UNKNOWN | —                  | []                                                                                                      | 3098         |
| Webster Health Services, Inc.                                                  | UNKNOWN | —                  | []                                                                                                      | 1993         |
| Wright Memorial Hospital                                                       | UNKNOWN | —                  | 191 Iowa Boulevard                                                                                      | 1938         |
| Children's Hospital of The King's Daughters                                    | VA      | —                  | 601 Children's Lane                                                                                     | 5421         |
| Sheltering Arms Institute                                                      | VA      | —                  | []                                                                                                      | 5436         |
| Ascension SE Wisconsin Hospital - Elmbrook Campus                              | WI      | —                  | 19333 W. North Ave Brookfield WI 43045                                                                  | 5284         |
| willow creek behavioral health                                                 | WV      | —                  | 1351 Ontario Rd, Green Bay WI 54311                                                                     | 3000         |
| Niobrara Community Hospital                                                    | WY      | —                  | N/A                                                                                                     | 2798         |

## 6. Post-Import Verification Targets

After the NJ/PA reimport, re-run this script and verify the following:

| Metric                  | Expected After Reimport                      | Verify Via                  |
| ----------------------- | -------------------------------------------- | --------------------------- |
| Total Supabase charges  | 13,972,316                                   | Section 1 Funnel — gap = 0  |
| NJ Supabase charges     | See NJ row in Section 3 (DDB Charges column) | NJ row Match = ✓            |
| PA Supabase charges     | See PA row in Section 3 (DDB Charges column) | PA row Match = ✓            |
| NJ providers            | See NJ row — DDB Hosps column                | NJ SB Providers = DDB Hosps |
| PA providers            | See PA row — DDB Hosps column                | PA SB Providers = DDB Hosps |
| Null-location providers | 271 (unchanged by reimport)                  | Section 5 count             |

_Null-location count will not change with NJ/PA reimport — those providers are already in Supabase._
_Fixing null-location requires a separate geocoding task (see Section 5)._

## 7. Full Data Inventory — What We're Sitting On

This section shows the complete Trilliant Oria dataset and how much of it ClearCost currently uses.
It is intended to inform product roadmap and investor conversations.

### standard_charges Setting Breakdown (Normalized)

_Setting values normalized via `TRIM(LOWER(setting))` — Trilliant data contains 30+ case/spacing variants._

| Setting (normalized)     |       Row Count | % of Total | Import behavior                                    |
| ------------------------ | --------------: | ---------: | -------------------------------------------------- |
| `outpatient`             |     159,162,368 |      58.0% | ✅ Included                                        |
| `both`                   |      64,310,112 |      23.4% | ✅ Included (can be done outpatient)               |
| `inpatient`              |      50,822,521 |      18.5% | ✅ Included (code list is the filter, not setting) |
| `0`                      |           3,538 |       0.0% | ⚠ Included (unrecognized value)                    |
| `null`                   |             996 |       0.0% | ✅ Included (NULL treated as outpatient)           |
| `hospital`               |             265 |       0.0% | ⚠ Included (unrecognized value)                    |
| `clinic`                 |              19 |       0.0% | ⚠ Included (unrecognized value)                    |
| `specialty`              |               8 |       0.0% | ⚠ Included (unrecognized value)                    |
| `inpatient / outpatient` |               1 |       0.0% | ⚠ Included (unrecognized value)                    |
| **Total**                | **274,299,828** |       100% |                                                    |

> **Note on "both"**: These rows represent procedures that hospitals offer under both inpatient AND outpatient
> billing contexts. The import includes them since they can be performed outpatient (correct behavior).

### Data Layer Summary

```
Trilliant Oria — Full Dataset
┌──────────────────────────────────────────────────────────────────┐
│  standard_charges table:    274,299,828 rows total                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Phase 1-5 (LIVE)                                       │    │
│  │  All settings + 1,002 curated codes + completed hospitals  │    │
│  │      13,972,316 rows   (  5.1% of total)            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Phase 6 — All remaining codes                                  │
│     260,327,512 rows   ( 94.9% of total)                    │
│  All codes NOT in our 1,002 curated set (all settings)          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  payer_detail table:    6,381,051,296 rows                       │
│  (individual negotiated rates per insurer per code per hospital) │
│                                                                  │
│  Phase 8 — Insurance transparency                               │
│  "What does Aetna pay at NYU Langone for a knee MRI?"            │
│  Currently: 0 rows imported (using avg/min/max summaries only)   │
└──────────────────────────────────────────────────────────────────┘
```

### Supabase Hosting Cost Reality Check

| Layer                               |          Rows | Est. Storage | Feasibility                                |
| ----------------------------------- | ------------: | ------------ | ------------------------------------------ |
| Phase 1-5 (current)                 |    13,972,316 | ~2-3 GB      | ✅ Supabase Pro                            |
| + Phase 6 (all codes, all settings) |   274,299,828 | ~60-70 GB    | ⚠ Supabase scales, cost climbs             |
| + Phase 8 (+ payer detail)          | 6,381,051,296 | ~1-2 TB      | 🔴 Needs dedicated infra or data warehouse |

_Estimates assume ~200 bytes/row average across all columns._
_Phase 8 (payer detail) is a fundamentally different infrastructure problem — likely needs MotherDuck, BigQuery, or a dedicated analytics DB rather than Supabase._
