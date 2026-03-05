# ClearCost Data Snapshot

_Generated: 2026-03-02T20:40:25.918Z_

To regenerate after an import:

```bash
npx tsx --env-file=.env.local lib/data/generate-snapshot.ts
```

Each run creates a new file in `docs/snapshots/YYYY-MM-DD_HH-MM-SS.md` and updates `docs/data-snapshot.md` (latest).

## Executive Summary

| Metric                      |         Value | Status                                            |
| --------------------------- | ------------: | ------------------------------------------------- |
| Supabase charges (live)     |    13,115,268 | ⚠ 100.3% of target                                |
| DuckDB target (filtered)    |    13,077,101 | —                                                 |
| Gap                         |       -38,167 | unknown missing                                   |
| Supabase providers          |         5,419 | ✅ all completed hospitals                        |
| Geocoded providers          | 5,409 (99.8%) | ✅ 10 unfixable (see docs/unfixable-providers.md) |
| Excluded hospitals (DuckDB) |           620 | ℹ Trilliant data quality                          |

### Open Action Items

| Priority | Issue                                                        | Rows Affected               |
| -------- | ------------------------------------------------------------ | --------------------------- |
| 🔴       | unknown charges missing — reimport needed                    | 293,490                     |
| ✅       | Geocode backfill complete — 10 unfixable remain (26 charges) | docs/unfixable-providers.md |

### Data We're Sitting On

| Phase                                  | Available Rows | Status          |
| -------------------------------------- | -------------: | --------------- |
| 1-5: Current (1,002 codes, outpatient) |     13,077,101 | ✅ 100.3% live  |
| 6: All outpatient codes                |   +210,400,206 | 📋 Planned      |
| 7: Inpatient pricing                   |    +50,822,521 | 📋 Planned      |
| 8: Payer-specific rates                | +6,381,051,296 | 🔮 Future infra |

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
  └─ Filtered charges (1,002 codes, outpatient only, completed hospitals):
                 13,077,101

Supabase (current state)
  ├─ Providers:    5,419  (5,409 geocoded, 10 unfixable — see docs/unfixable-providers.md)
  └─ Charges:   13,115,268

  Gap: -38,167 charges not yet in Supabase
```

## 2. DuckDB Hospital Status Breakdown

| Status               |     Count |
| -------------------- | --------: |
| `completed`          |     5,419 |
| `mrf_download_error` |       351 |
| `parse_error`        |       269 |
| **Total**            | **6,039** |

## 3. Per-State Data Table

_DuckDB: completed hospitals + filtered charge count (1,002 codes, outpatient, completed hospitals only)_
_Supabase: providers imported + geocoding status + charges imported_
_**MISSING** = DuckDB has completed hospitals with charges, but Supabase has 0 charges (needs import)_

| State   | DDB Hosps | DDB Charges | SB Providers | SB Geocoded | SB Null Loc | SB Charges | Match       |
| ------- | --------: | ----------: | -----------: | ----------: | ----------: | ---------: | ----------- |
| AK      |        20 |      27,582 |           20 |          20 |           0 |     27,777 | ✓           |
| AL      |        90 |     129,886 |           95 |          89 |           6 |    136,152 | ✓           |
| AR      |        98 |      91,595 |           99 |          94 |           5 |     91,918 | ✓           |
| AZ      |        97 |      98,012 |           97 |          89 |           8 |     98,523 | ✓           |
| CA      |       331 |     776,751 |          332 |         294 |          38 |    780,034 | ✓           |
| CO      |       109 |     307,816 |          110 |          97 |          13 |    309,669 | ✓           |
| CT      |        22 |      26,925 |           22 |          22 |           0 |     27,009 | ✓           |
| DC      |        53 |       1,436 |           54 |          54 |           0 |      1,713 | ⚠ partial   |
| DE      |        15 |      17,026 |           15 |          15 |           0 |     17,042 | ✓           |
| FL      |       366 |   1,837,350 |          370 |         349 |          21 |  1,872,200 | ✓           |
| GA      |       132 |     234,836 |          132 |         127 |           5 |    235,094 | ✓           |
| HI      |        19 |      27,556 |           19 |          16 |           3 |     27,639 | ✓           |
| IA      |        89 |     140,196 |           89 |          89 |           0 |    140,957 | ✓           |
| ID      |        40 |      50,422 |           40 |          39 |           1 |     50,558 | ✓           |
| IL      |       162 |     255,492 |          171 |         167 |           4 |    261,941 | ✓           |
| IN      |       133 |     148,907 |          133 |         128 |           5 |    149,745 | ✓           |
| KS      |       112 |     266,062 |          117 |         106 |          11 |    269,161 | ✓           |
| KY      |       105 |     151,378 |          108 |         104 |           4 |    155,624 | ✓           |
| LA      |       132 |     143,801 |          136 |         124 |          12 |    145,684 | ✓           |
| MA      |       100 |     140,471 |          100 |          99 |           1 |    141,213 | ✓           |
| MD      |        44 |      32,506 |           44 |          38 |           6 |     32,521 | ✓           |
| ME      |        30 |      31,337 |           31 |          31 |           0 |     34,185 | ⚠ partial   |
| MI      |       136 |     207,976 |          136 |         123 |          13 |    208,801 | ✓           |
| MN      |        78 |     126,870 |           78 |          72 |           6 |    127,367 | ✓           |
| MO      |       113 |     333,196 |          119 |         108 |          11 |    337,855 | ✓           |
| MS      |        67 |      66,096 |           77 |          62 |          15 |     79,755 | ⚠ partial   |
| MT      |        38 |      38,987 |           40 |          40 |           0 |     42,616 | ⚠ partial   |
| NC      |       110 |     180,443 |          110 |          91 |          19 |    180,691 | ✓           |
| ND      |        32 |      39,115 |           33 |          33 |           0 |     39,245 | ✓           |
| NE      |        75 |      92,738 |           75 |          73 |           2 |     93,157 | ✓           |
| NH      |        20 |     105,798 |           20 |          20 |           0 |    105,841 | ✓           |
| NJ      |        94 |     181,706 |           98 |          91 |           7 |    197,961 | ⚠ partial   |
| NM      |        37 |      16,232 |           37 |          36 |           1 |     16,250 | ✓           |
| NV      |        63 |     965,985 |           63 |          52 |          11 |    969,944 | ✓           |
| NY      |       139 |     277,492 |          168 |         164 |           4 |    367,404 | ⚠ partial   |
| OH      |       229 |     256,787 |          231 |         210 |          21 |    260,739 | ✓           |
| OK      |        97 |     105,510 |          101 |          97 |           4 |    110,439 | ✓           |
| OR      |        50 |     146,529 |           51 |          41 |          10 |    147,879 | ✓           |
| PA      |       243 |     358,386 |          246 |         234 |          12 |    360,130 | ✓           |
| PR      |         0 |           0 |            6 |           6 |           0 |      3,281 | ✓           |
| RI      |         9 |      13,032 |            9 |           9 |           0 |     13,080 | ✓           |
| SC      |        70 |     109,870 |           70 |          69 |           1 |    110,022 | ✓           |
| SD      |        22 |      26,801 |           22 |          22 |           0 |     26,954 | ✓           |
| TN      |       139 |     496,792 |          140 |         134 |           6 |    498,315 | ✓           |
| TX      |       683 |   2,898,709 |          691 |         616 |          75 |  3,006,906 | ✓           |
| UT      |        58 |     148,735 |           58 |          55 |           3 |    148,775 | ✓           |
| VA      |        98 |     253,710 |          104 |          96 |           8 |    254,998 | ✓           |
| VT      |         7 |       7,498 |            7 |           7 |           0 |      7,530 | ✓           |
| WA      |        86 |     125,927 |           86 |          79 |           7 |    126,535 | ✓           |
| WI      |       142 |     202,710 |          142 |         138 |           4 |    203,459 | ✓           |
| WV      |        44 |      25,102 |           44 |          43 |           1 |     25,255 | ✓           |
| WY      |        23 |      37,536 |           23 |          22 |           1 |     37,725 | ✓           |
| unknown |       118 |     293,490 |            0 |           0 |           0 |          0 | **MISSING** |

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

## 5. Provider Geography (RESOLVED 2026-03-03)

**Fixed:** 599 of 609 affected providers remediated. Geocoding rate: **92.9% → 99.8%**.

**Root cause:** `extractZip()` in `import-trilliant.ts` grabbed street numbers instead of real ZIP codes (e.g., "10018 Gravois Rd" → ZIP "10018" which is NYC, not Missouri). Since lat/lng are derived from ZIP via `zipcodes.lookup()`, coordinates were wrong too. Additionally, 385 providers had no parseable ZIP at all.

**Fix applied:** Three-tier geocoding cascade (see `scripts/fix-provider-geography.ts`):

1. `extractZipV2` — find all 5-digit numbers, walk backwards, validate via zipcodes + state match (387 fixed)
2. `lookupByName` — city+state → ZIP centroid with abbreviation expansion (28 fixed)
3. Google Maps Geocoding API — full address → precise lat/lng (184 fixed)

Follow-up pass (`scripts/fix-provider-geo-followup.ts`): corrected 45 wrong state fields + 12 placeholder ZIPs via reverse geocode.

**Pipeline hardened:** `extractZip()` and `geocodeByZip()` in `import-trilliant.ts` replaced with validated versions. Future imports won't reintroduce this issue.

**10 unfixable providers remain** — garbage addresses (`[]`, `TBD`) with no city data. Only 26 total charges affected.
See `docs/unfixable-providers.md` for full listing.

## 6. Post-Import Verification Targets

After the NJ/PA reimport, re-run this script and verify the following:

| Metric                  | Expected After Reimport                      | Verify Via                              |
| ----------------------- | -------------------------------------------- | --------------------------------------- |
| Total Supabase charges  | 13,077,101                                   | Section 1 Funnel — gap = 0              |
| NJ Supabase charges     | See NJ row in Section 3 (DDB Charges column) | NJ row Match = ✓                        |
| PA Supabase charges     | See PA row in Section 3 (DDB Charges column) | PA row Match = ✓                        |
| NJ providers            | See NJ row — DDB Hosps column                | NJ SB Providers = DDB Hosps             |
| PA providers            | See PA row — DDB Hosps column                | PA SB Providers = DDB Hosps             |
| Null-location providers | 10 (RESOLVED — was 385, fixed 2026-03-03)    | Section 5 / docs/unfixable-providers.md |

_Null-location count will not change with NJ/PA reimport — those providers are already in Supabase._
_Null-location geocoding completed 2026-03-03 — 375 of 385 fixed, 10 unfixable remain (see Section 5)._

## 7. Full Data Inventory — What We're Sitting On

This section shows the complete Trilliant Oria dataset and how much of it ClearCost currently uses.
It is intended to inform product roadmap and investor conversations.

### standard_charges Setting Breakdown (Normalized)

_Setting values normalized via `TRIM(LOWER(setting))` — Trilliant data contains 30+ case/spacing variants._

| Setting (normalized)     |       Row Count | % of Total | Import behavior                          |
| ------------------------ | --------------: | ---------: | ---------------------------------------- |
| `outpatient`             |     159,162,368 |      58.0% | ✅ Included                              |
| `both`                   |      64,310,112 |      23.4% | ✅ Included (can be done outpatient)     |
| `inpatient`              |      50,822,521 |      18.5% | ❌ Excluded by import filter             |
| `0`                      |           3,538 |       0.0% | ⚠ Included (unrecognized value)          |
| `null`                   |             996 |       0.0% | ✅ Included (NULL treated as outpatient) |
| `hospital`               |             265 |       0.0% | ⚠ Included (unrecognized value)          |
| `clinic`                 |              19 |       0.0% | ⚠ Included (unrecognized value)          |
| `specialty`              |               8 |       0.0% | ⚠ Included (unrecognized value)          |
| `inpatient / outpatient` |               1 |       0.0% | ⚠ Included (unrecognized value)          |
| **Total**                | **274,299,828** |       100% |                                          |

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
│  │  Outpatient + 1,002 curated codes + completed hospitals  │    │
│  │      13,077,101 rows   (  4.8% of total)            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Phase 6 — More outpatient codes                                │
│     210,400,206 rows   ( 76.7% of total)                    │
│  All outpatient codes NOT in our 1,002 curated set              │
│                                                                  │
│  Phase 7 — Inpatient pricing (MS-DRG codes)                     │
│      50,822,521 rows   ( 18.5% of total)                    │
│  Hospital admission-level pricing (not shoppable)               │
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

| Layer                      |          Rows | Est. Storage | Feasibility                                |
| -------------------------- | ------------: | ------------ | ------------------------------------------ |
| Phase 1-5 (current)        |    13,077,101 | ~2-3 GB      | ✅ Supabase Pro                            |
| + Phase 6 (all outpatient) |   223,477,307 | ~40-50 GB    | ⚠ Supabase scales, cost climbs             |
| + Phase 7 (+ inpatient)    |   274,299,828 | ~60-70 GB    | ⚠ Same order of magnitude                  |
| + Phase 8 (+ payer detail) | 6,381,051,296 | ~1-2 TB      | 🔴 Needs dedicated infra or data warehouse |

_Estimates assume ~200 bytes/row average across all columns._
_Phase 8 (payer detail) is a fundamentally different infrastructure problem — likely needs MotherDuck, BigQuery, or a dedicated analytics DB rather than Supabase._

### ⚠ Data Quality Finding: Import Filter Gap

The import filter in `import-trilliant.ts` uses `LOWER(setting) != 'inpatient'` to exclude
inpatient rows. However, **LOWER() does not trim whitespace**. Trilliant's data contains
setting values like `"inpatient "` (trailing space) and `" inpatient "` (leading + trailing)
that are NOT caught by this filter.

```
LOWER('inpatient ')  = 'inpatient '  ← NOT equal to 'inpatient' → incorrectly imported
LOWER(' inpatient ') = ' inpatient ' ← NOT equal to 'inpatient' → incorrectly imported
LOWER('INPATIENT')   = 'inpatient'   ← equal to 'inpatient'    → correctly excluded
```

**Fix**: Change the filter to `TRIM(LOWER(setting)) != 'inpatient'` in import-trilliant.ts.
**Impact**: The current Supabase dataset may include a small number of inpatient charges.
This is tracked in a future cleanup task.
