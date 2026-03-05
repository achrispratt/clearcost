# ClearCost Session Context — Feb 18, 2026

## What Was Accomplished This Session

### 1. Database Migration (DONE)

- Ran `scripts/full-migration.sql` against live Supabase (project ref: `rzfelzmkdbicrfghofyf`)
- Fixed policy drop order bug (policies can't be dropped on non-existent tables)
- All 5 tables created: `providers`, `charges`, `payer_rates`, `payers`, `saved_searches`
- Both RPC functions working: `search_charges_nearby()`, `search_charges_by_description()`
- Supabase CLI linked and `SUPABASE_ACCESS_TOKEN` saved to `~/.zshrc`

### 2. Oria Data Downloaded & Extracted (DONE)

- Downloaded `mrf_lake.zip` (28GB) from Trilliant Oria via curl with resume
- Extracted to `lib/data/` — 81GB of Parquet files + 11MB DuckDB file
- Data structure: DuckDB has `hospitals` table (6,039 rows) + views pointing to Parquet files
- Parquet dirs: `standard_charges/`, `standard_charge_details/`, `modifier_charges/`, `modifier_charge_details/`
- Files partitioned by `hospital_state`

### 3. Data Quality Verified

- **6,039 hospitals** total, **5,419 completed** (with data), 620 failed (parse/download errors)
- **5,407 have street addresses**, 5,419 have city, 5,301 have state
- **274 million** standard_charges rows
- **6 billion** standard_charge_details rows (payer-specific rates)
- **85M** with CPT codes, **91M** with HCPCS, **38M** with MS-DRG, **186M** with revenue codes
- Pre-computed aggregates on standard_charges: `avg_negotiated_rate`, `min_negotiated_rate`, `max_negotiated_rate`, `payer_count`

## What Still Needs To Happen

### Data Import (PARTIALLY DONE — needs Supabase Pro upgrade)

Import script `lib/data/import-trilliant.ts` fully updated and tested.

**What's done:**

- 5,419 providers imported to Supabase (5,034 geocoded, 385 missing zip)
- Wyoming test import succeeded: 37,725 charges inserted, no errors
- Import script tested and working end-to-end

**What's next:**

- Upgrade Supabase from Free to Pro ($25/month) — free plan has 500MB limit, we need ~3.9GB
- Run full import: `npx tsx --env-file=.env.local lib/data/import-trilliant.ts --skip-providers`
- `--skip-providers` because providers are already imported

**Import strategy: 1,010 curated CPT/HCPCS codes, national scope**

- Codes sourced from 4 lists merged into `lib/data/final-codes.json`:
  - CMS 70 mandatory shoppable services
  - CMS top 200 Level I CPT codes by charges (from cms.gov spreadsheet)
  - Top 500 most universally reported codes by hospital coverage
  - FAIR Health 300+ consumer shoppable services
- National coverage: ~13.1M rows, ~4,230 hospitals, ~3.9GB (fits Supabase Pro 8GB)
- Checks BOTH `cpt` AND `hcpcs` columns (many hospitals code under hcpcs instead of cpt)
- Drops inpatient rows (`setting != 'inpatient'`) — outpatient/shoppable only for MVP
- Includes all billing_class variants (facility, professional, both, null) for all-in cost estimation
- Skips payer_rates/standard_charge_details for MVP (pre-computed aggregates sufficient)
- Geocodes via `zipcodes` npm package (zip-centroid lat/lng, ~5 mile accuracy, free, instant)
- DuckDB memory limits: `SET memory_limit = '4GB'`, `SET threads = 2`
- State-by-state processing: iterates through states to keep DuckDB memory manageable

**Decisions resolved:**

- Geocoding: zip-based via `zipcodes` package (no Google Maps API needed for import)
- Revenue codes: too generic for consumer search (e.g., "OR services per 15 min"), excluded from filtering
- ICD codes: diagnosis codes, not useful for procedure search (Claude already does symptom→CPT)
- HCPCS Level II: includes supplies/drugs/equipment — useful for expanded search later
- All-in cost: three-tier approach using billing_class data + Claude prompt for context warnings

### Other .env.local Issues

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = placeholder value (not needed for import, only for map UI)
- `ANTHROPIC_API_KEY` = placeholder value (needed for live search, not import)

## Key Data Insights Discussed

### Billing Code Types

- **CPT**: Specific procedures (MRI, X-ray, office visit). Primary search target. Claude translates natural language → CPT.
- **HCPCS**: Superset of CPT, adds supplies/drugs/equipment. Second most useful.
- **MS-DRG**: Inpatient hospital stays grouped by diagnosis. Covers admissions.
- **Revenue Code**: Facility line items (OR time, pharmacy, MRI dept). Too generic for consumer search.

### The "All-In Cost" Problem

- Hospital charges come in components: facility fee + professional fee (radiologist, etc.)
- `billing_class` field indicates: "facility", "professional", "Both", or null
- Null billing_class (12,457 of 16,668 MRI knee rows) likely represents bundled all-in prices
- Professional fees often billed by independent physician groups NOT in hospital MRF data
- MVP approach: show available price, label what it covers, add disclaimer
- This is an industry-wide unsolved problem — competitors handle it the same way

### Hospital vs. Payer Data (Two Federal Mandates)

- **Hospital Price Transparency Rule** (2021): Hospitals publish MRFs. Covers hospital services only (~12% of encounters). Includes cash prices.
- **Transparency in Coverage Act** (2022): Insurers publish MRFs. Covers ALL provider types. No cash prices — only negotiated rates.
- Oria dataset = hospital MRFs only
- Payer TiC data would expand to clinics, private practices, labs, etc. but no cash prices for those

### Product Graduation Path (saved in plan file)

Full roadmap saved at `/Users/chrispratt/.claude/plans/imperative-wishing-brooks.md` under "Product Graduation Path" section:

- MVP: Cash prices + aggregated payer stats (Supabase Pro, ~5-8GB)
- Phase 7: Plan-level insurance pricing from hospital data (~50-100GB, outgrow Supabase)
- Phase 8: Payer TiC data for all provider types (~200-500GB)
- Phase 9: Non-hospital cash prices (crowdsourced/partnerships/state data)

## File Locations

- **Implementation plan**: `/Users/chrispratt/.claude/plans/imperative-wishing-brooks.md`
- **DuckDB file**: `/Users/chrispratt/clearcost/lib/data/mrf_lake.duckdb`
- **Parquet data**: `/Users/chrispratt/clearcost/lib/data/parquet/` (~81GB)
- **Zip file**: `/Users/chrispratt/clearcost/lib/data/mrf_lake.zip` (~28GB, can delete after import)
- **Import script**: `/Users/chrispratt/clearcost/lib/data/import-trilliant.ts` (needs updates)
- **Top payers config**: `/Users/chrispratt/clearcost/lib/data/top-payers.ts`
- **Migration SQL**: `/Users/chrispratt/clearcost/scripts/full-migration.sql`
- **Migration (applied)**: `/Users/chrispratt/clearcost/supabase/migrations/20260218085614_full_schema.sql`

## Key Product Decision: Facility Fee vs. All-In Cost

### The Reality

- Hospital MRF data is primarily **facility/technical fees** — not the total cost of a visit
- Patients routinely get **multiple separate bills**: hospital facility fee, radiologist, anesthesiologist, pathologist — each from independent billing entities
- The facility fee is typically **70-80% of total cost** for imaging, 50-70% for surgeries
- Professional fees (radiologist reading, anesthesia, etc.) are billed by independent physician groups with their own contracts, NOT through the hospital

### MVP Approach (decided)

- Show ALL pricing we have — don't hide or filter anything based on billing_class
- Be **contextually transparent** about what might be missing — not a blanket disclaimer on every result, but smart callouts where the data tells us the picture is incomplete
- Use `billing_class` to drive UI context:
  - "Both" or bundled → show as a more complete estimate, no extra caveat needed
  - "facility" → note that professional fees (e.g., radiologist reading, anesthesia) may apply separately
  - "professional" → note this is the physician fee only, facility charges may be separate
  - null → show as-is (most common, likely already bundled at many hospitals)
- The callouts should be **procedure-aware** where possible: MRI → "radiologist reading fee may apply separately"; surgery → "anesthesia and surgeon fees may be billed separately"
- Do NOT label everything as just "facility fee" — show what we have, and only flag gaps where the data indicates them

### Future Opportunity: All-In Cost Estimation

- **Investigate whether Trilliant has more granular data** that separates or aggregates facility + professional fees
- **Build estimated total cost ranges** by adding typical professional fee percentages on top of facility data (e.g., MRI facility + ~$50-150 radiologist reading)
- **Cross-reference payer TiC data** (Phase 8) — payer MRFs include negotiated rates for professional services, which could fill in the professional fee gap
- **Crowdsource actual total costs** from users — "What did you actually pay total?" to build a real-world cost database
- This would be a genuine differentiator — no competitor currently shows reliable all-in cost estimates

## Open Questions (Resolved)

- ~~Geocoding approach~~ → zip-based via `zipcodes` npm package
- ~~Whether 274M charges all need importing~~ → Top 500 CPT/HCPCS codes nationally (~8.9M rows)
- ~~How to handle billing_class~~ → Show all, use billing_class for smart UI callouts
- ~~State-based vs national~~ → National with code-based filtering
- ~~HCPCS column discovery~~ → Must check BOTH cpt AND hcpcs columns (recovers ~1,800 hospitals)
