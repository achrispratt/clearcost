# ClearCost — Product Requirements Document

## 1. Product Vision & Problem Statement

### The Problem

Healthcare pricing in the United States is opaque, fragmented, and nearly impossible for consumers to navigate. A knee MRI can cost $400 at one hospital and $4,000 at another hospital 10 miles away — but patients have no practical way to discover this before receiving a bill.

### The Regulatory Opportunity

Two federal mandates have created an unprecedented dataset:

- **Hospital Price Transparency Rule (Jan 2021)**: All hospitals must publish machine-readable files (MRFs) containing cash prices, gross charges, and payer-negotiated rates for all services. Compliance is ~90% but data quality varies.
- **Transparency in Coverage Act (Jul 2022)**: All health insurers must publish MRFs with negotiated rates for all in-network providers. Covers all provider types (clinics, labs, private practices), not just hospitals.

The data exists. The problem is that it's buried in thousands of JSON/CSV files formatted for machines, not people. No consumer-facing product has successfully made this data accessible, searchable, and understandable at national scale.

### The Vision

ClearCost is the **Kayak for healthcare pricing** — a consumer tool that lets anyone search for a medical procedure in plain English and instantly compare real hospital prices near them. Think: "I need a knee MRI near Austin, TX" returns a sorted list of hospitals with actual prices, on a map, within seconds.

### Why This Can Work

- The data is public, free, and federally mandated — no partnerships needed for MVP
- AI (Claude) can bridge the gap between how patients describe procedures and how hospitals code them (CPT/HCPCS)
- PostGIS enables fast geographic queries across 5,000+ hospitals
- The 1,010 most common shoppable procedures cover the vast majority of what consumers actually search for

---

## 2. Target Users

### Primary: The Cost-Conscious Healthcare Consumer

- **Uninsured patients** (28M Americans) who pay cash and have the most to gain from price comparison
- **Underinsured patients** with high deductibles ($3,000-$8,000) who effectively pay cash until their deductible is met
- **Health tourism shoppers** willing to travel for significant savings (especially for procedures >$1,000)
- **Self-pay by choice** patients who may have insurance but prefer to pay cash when the cash price is lower than their negotiated rate

### Secondary (Future)

- Insured patients comparing in-network costs across hospitals (Phase 7)
- Employers and benefits administrators evaluating network adequacy
- Healthcare journalists and policy researchers

### User Behavior Assumptions

- Users describe procedures in plain language, not billing codes
- Users want to search by location (ZIP code, city, or browser geolocation)
- Price is the primary sort criterion, distance is secondary
- Users need context about what a price covers (facility fee vs. all-in cost)
- Trust comes from showing data sources and being transparent about limitations

---

## 3. Core MVP Features

### 3.1 Plain English Search

Users type natural language queries like "knee MRI", "colonoscopy", "blood work panel", or "physical therapy session." Claude AI translates these into standardized billing codes (CPT/HCPCS).

**Search flow:**
1. User enters procedure description + location
2. Claude translates description into billing code(s) with code type
3. PostGIS queries `charges` table for matching codes near the user's location
4. Results returned sorted by cash price ascending
5. **Fallback**: If code-based search returns zero results, falls back to `description ILIKE` search against the charges table

### 3.2 Results List View

- Cash price displayed prominently
- Gross charge shown as comparison (strikethrough)
- Average negotiated rate across payers
- Hospital name, distance in miles
- Setting badge (outpatient/inpatient)
- Billing class context (facility fee, professional fee, bundled)
- Data freshness indicator ("Prices updated: Jan 2026")
- Source attribution ("Source: Hospital MRF data")
- Graceful degradation: fewer than 3 results shows a disclaimer with suggestion to expand radius

### 3.3 Map View

Google Maps integration showing hospital locations as pins with price labels. Click a pin to see the full price card.

### 3.4 Filtering & Sorting

- **Sort by**: Price (low-high), distance (near-far), hospital name (A-Z)
- **Filter by**: Distance radius (25/50/100/250 miles), price range, setting (outpatient/inpatient), provider type
- **Insurance dropdown**: Select a payer to see payer-specific negotiated rate (from aggregated data)

### 3.5 Save & Bookmark

- Google OAuth sign-in via Supabase Auth
- Save search results with location context (lat/lng stored)
- View saved searches history
- Search is open to all; saving requires sign-in

---

## 4. Data Architecture

### 4.1 Data Source: Trilliant Oria

The MVP uses Trilliant Health's free Oria data lake — a consolidated, pre-processed version of hospital MRF files.

- **Coverage**: 6,039 hospitals nationally (5,419 with complete data)
- **Volume**: 274 million standard charges, 6 billion payer-specific detail rows
- **Format**: DuckDB index + Parquet files (81GB local), queried via `duckdb-async`
- **Pre-computed aggregates**: avg/min/max negotiated rates, payer count per charge
- **Freshness**: Updated periodically by Trilliant (exact cadence TBD)

### 4.2 Code List: 1,010 Curated Codes

Rather than importing all 274M charges, the MVP filters to 1,010 carefully curated CPT/HCPCS codes representing the most shoppable procedures. This reduces the import to ~13.1M rows (~3.9GB).

Sources merged into `lib/data/final-codes.json`:
1. **CMS 70** — Federally mandated shoppable services every hospital must list
2. **CMS Top 200** — Level I CPT codes with highest total charges nationally
3. **Top 500** — Most universally reported codes by hospital coverage count
4. **FAIR Health 300+** — Consumer-oriented shoppable services from the leading healthcare cost database

### 4.2.1 Data Scope & Exclusions

The MVP imports a curated subset of the full Oria dataset — roughly 4.8% of source rows. This section documents what's included, what's excluded, and why.

**Data Funnel: Full Dataset → MVP Import**

```
Trilliant Oria Full Dataset
├── 274M standard_charges rows
├── 6B standard_charge_details rows (payer-specific)
├── 120K distinct CPT codes, 109K HCPCS, 5.6K MS-DRG
└── 6,039 hospitals
        │
        ▼ Filter 1: Code filter (1,010 curated codes)
        │   Keeps rows where cpt OR hcpcs matches our code list
        │   Drops ~95% of rows (most hospital line items are for codes outside our list)
        │
        ▼ Filter 2: Outpatient only
        │   Drops rows where setting = 'inpatient' (~7% of code-matched rows)
        │   Inpatient pricing is complex, not consumer-shoppable
        │
        ▼ Filter 3: Aggregated payer stats only
        │   Uses pre-computed avg/min/max from standard_charges
        │   Skips ALL 6 billion payer detail rows entirely
        │
        ▼ Result: MVP Import
            ~13.1M charges rows (~4.8% of standard_charges)
            0 payer detail rows (0% of standard_charge_details)
            5,419 providers
            ~3.9 GB in Supabase
```

**What's excluded and why:**

| Exclusion | Rows Dropped | % of Total | Reason |
|-----------|-------------|------------|--------|
| Non-matching codes | ~261M | ~95.2% | MVP focuses on 1,010 most shoppable procedures |
| Inpatient rows | ~62K of matched | ~7% of matched | Not consumer-shoppable (complex multi-day stays) |
| Payer detail rows | ~6B | 100% | Pre-aggregated stats sufficient for MVP; plan-level pricing is Phase 7 |
| Revenue/ICD/other codes | (overlap with above) | — | Too generic (revenue) or not procedure-based (ICD) |

**Precise source counts (from DuckDB queries on full Oria dataset):**

| Metric | Value |
|--------|-------|
| Total standard_charges | 274,299,828 |
| Total standard_charge_details (payer-specific) | ~6 billion |
| Distinct CPT codes | 120,097 |
| Distinct HCPCS codes | 109,354 |
| Distinct MS-DRG codes | 5,628 |
| Inpatient rows | 50,777,849 (18.5%) |
| Outpatient/null rows | 223,521,979 (81.5%) |
| Hospitals total | 6,039 |
| Hospitals with data | 5,419 |
| Curated MVP codes | 1,010 |
| Estimated MVP rows | ~13.1M |

**Expansion path:**
- More codes → import more of the 120K CPT / 109K HCPCS codes
- Inpatient → add MS-DRG data (~50.8M rows, Phase 7+)
- Payer detail → 6B rows, requires self-hosted Postgres (~50-100GB, Phase 7)
- Full dataset → ~274M charges + 6B details, requires dedicated infrastructure (Phase 8+)

### 4.3 Billing Code Types

| Code Type | What It Covers | MVP Use |
|-----------|---------------|---------|
| **CPT** | Procedures (MRI, surgery, office visit) | Primary search target |
| **HCPCS** | Superset of CPT + supplies/drugs/equipment | Secondary search (many hospitals use HCPCS instead of CPT) |
| **MS-DRG** | Inpatient hospital stays by diagnosis | Excluded for MVP (inpatient filtered out) |
| **Revenue Code** | Facility line items (OR time, pharmacy) | Too generic for consumer search |
| **ICD** | Diagnosis codes | Not used (Claude handles symptom-to-procedure translation) |

**Critical data insight**: Many hospitals populate the `hcpcs` column instead of `cpt` for the same procedures. The import and search always check BOTH columns to avoid missing ~1,800 hospitals.

### 4.4 The "All-In Cost" Problem

Hospital charges come in components: facility fee + professional fee (radiologist, anesthesiologist, etc.). The `billing_class` field indicates what a charge covers.

**MVP approach — contextual transparency:**
- Show ALL available pricing (don't hide or filter by billing_class)
- "Both" or null billing_class → show as a more complete estimate
- "facility" → note that professional fees may apply separately
- "professional" → note this is physician fee only, facility charges may be separate
- Procedure-aware callouts: MRI → "radiologist reading fee may apply"; surgery → "anesthesia and surgeon fees may be billed separately"
- Do NOT label everything as "facility fee" — show what we have, flag gaps where data indicates them

### 4.5 Database Schema

**5 tables in Supabase (Postgres + PostGIS):**

- **`providers`** — Hospital records with PostGIS geography column for spatial queries. Geocoded via `zipcodes` npm package (zip-centroid lat/lng).
- **`charges`** — Procedure pricing with support for all billing code types. Includes cash price, gross charge, and pre-computed aggregated payer stats (avg/min/max negotiated rate, payer count).
- **`payer_rates`** — Individual payer negotiated rates per charge (deferred for MVP — aggregates sufficient).
- **`payers`** — Canonical payer list for UI dropdown.
- **`saved_searches`** — User-scoped saved searches with location coordinates.

**2 RPC functions:**
- `search_charges_nearby()` — Code-based search with PostGIS radius filtering
- `search_charges_by_description()` — Description-based fallback search

**RLS policies**: Public read on providers/charges/payer_rates/payers. User-scoped write on saved_searches.

---

## 5. Technical Architecture

### 5.1 Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, DaisyUI 5 |
| Database | Supabase (Postgres 15 + PostGIS) |
| Auth | Supabase Auth (Google OAuth) |
| AI | Claude API (Anthropic SDK) — Sonnet for cost efficiency |
| Maps | Google Maps JavaScript API |
| Data Pipeline | DuckDB + Parquet (local), bulk insert to Supabase |
| Hosting | Vercel |

### 5.2 Search Pipeline

```
User query ("knee MRI near 78701")
  |
  v
Claude AI (plain English -> CPT/HCPCS codes + code type)
  |
  v
PostGIS query (search_charges_nearby RPC)
  - Joins charges <-> providers
  - ST_DWithin for radius filtering
  - Sorted by cash_price ASC
  |
  v
[Zero results?] -> Fallback: description ILIKE search
  |
  v
Results returned to frontend (list + map views)
```

### 5.3 Auth Flow

1. User clicks "Sign in with Google"
2. Supabase Auth redirects to Google OAuth
3. Callback handler at `/auth/callback` exchanges code for session
4. Supabase middleware manages session cookies
5. RLS policies scope saved_searches to authenticated user

### 5.4 Data Import Pipeline

```
Trilliant Oria (DuckDB + 81GB Parquet)
  |
  v
import-trilliant.ts (TypeScript, runs locally)
  - Step 1: hospitals -> providers (geocoded via zipcodes package)
  - Step 2: standard_charges -> charges (filtered to 1,010 codes, outpatient only)
  - State-by-state processing, 1000-row batches
  - DuckDB memory limits: 4GB RAM, 2 threads
  |
  v
Supabase (Postgres)
  - ~5,419 providers
  - ~13.1M charges (~3.9GB)
```

---

## 6. Key Product Decisions

### 6.1 National from Day One

The original prototype targeted NYC only (30-50 hospitals, 20-30 codes). The current architecture supports all 5,200+ hospitals nationally with 1,010 codes. This is a strategic decision: national coverage enables health tourism use cases and broader market appeal.

### 6.2 Outpatient Only for MVP

Inpatient charges (MS-DRG) are filtered out during import. Inpatient pricing is complex (multi-day stays, variable services) and less "shoppable." Outpatient procedures are what consumers can meaningfully comparison-shop.

### 6.3 Aggregated Payer Stats vs. Plan-Level Pricing

MVP shows avg/min/max negotiated rates across all payers rather than plan-specific pricing. This dramatically reduces data volume (3.9GB vs. 50-100GB) while still giving users useful context. Plan-level pricing is Phase 7.

### 6.4 Facility Fee Transparency (Not Hiding)

Rather than filtering to only "bundled" charges, the MVP shows all available pricing with contextual labels about what the charge covers. This is honest and matches how competitors handle the same data limitation.

### 6.5 Description Fallback Search

If Claude's translated billing code returns zero results from the database, the system falls back to fuzzy text matching on `charges.description`. This prevents dead-end searches and catches cases where hospitals use non-standard codes.

### 6.6 Zip-Based Geocoding

Providers are geocoded using the `zipcodes` npm package (zip-centroid lat/lng, ~5 mile accuracy) rather than Google Maps Geocoding API. This is free, instant, requires no API key, and is accurate enough for "hospitals near me" use cases.

---

## 7. Product Roadmap

### MVP: Cash Prices + Aggregated Payer Stats (Current)

- **Data**: Trilliant Oria hospital MRFs
- **Users see**: Cash price, gross charge, avg/min/max negotiated rates
- **Coverage**: 5,200+ hospitals, 1,010 procedure codes, national
- **Storage**: ~5-8 GB on Supabase Pro ($25/mo)
- **Target users**: Uninsured, underinsured, high-deductible plan holders

### Phase 6: Independent MRF Crawler

- Replace Trilliant dependency with self-crawled hospital MRFs
- Use CMS TPAFS `machine_readable_links.csv` for hospital MRF URLs
- Stream-parse CMS v3.0 JSON format
- Provides data freshness control and independence
- Schema is already source-agnostic — pipeline change only

### Phase 7: Plan-Level Insurance Pricing

- Store plan-specific negotiated rates (e.g., "Aetna PPO Gold" at Hospital X)
- Plan selection UI, deductible/co-insurance calculator
- ~50-100 GB storage — outgrows Supabase, migrate to self-hosted Postgres
- Pre-load top 20-30 plans covering ~80% of commercially insured Americans

### Phase 8: Payer Transparency in Coverage Data

- Layer in insurer MRF data (all provider types: clinics, labs, urgent care, etc.)
- Expands from hospitals only (~12% of encounters) to all providers
- Raw payer MRFs: 5-50 TB per insurer; after ETL: ~200-500 GB for top 10-20 insurers
- Reconciliation logic needed (hospital vs. payer MRF rate discrepancies)
- Payer data does NOT include cash prices for non-hospital providers

### Phase 9: Non-Hospital Cash Price Coverage

- Fill the gap for clinic/practice cash prices (no federal mandate)
- Options: crowdsourced prices, state transparency databases, direct provider onboarding, cash price aggregator partnerships
- Shifts from pure data engineering to marketplace/platform business
- Triggered by Phase 7-8 proving demand + revenue/funding

---

## 8. Infrastructure Trajectory

| Phase | Storage | Platform | Monthly Cost |
|-------|---------|----------|--------------|
| MVP (current) | ~5-8 GB | Supabase Pro | $25 |
| Phase 7 | ~50-100 GB | Self-hosted Postgres (AWS RDS / GCP Cloud SQL) | $200-600 |
| Phase 8 | ~500 GB-1 TB | Self-hosted Postgres + analytical store | $500-1,000 |
| Phase 9 | ~1-2 TB | Hybrid architecture | $1,000+ |

Key insight: **Phases 6-8 are pure data engineering** — all data is publicly available, no partnerships needed. Phase 9 is the inflection point requiring B2B relationships and a sales motion.

---

## 9. Success Metrics

### MVP "Working" Criteria

- **Search returns results**: Any common procedure query (MRI, colonoscopy, blood work) returns price data from nearby hospitals
- **Prices are accurate**: Cash prices match what hospitals publish in their MRF files
- **Performance**: Search results return in < 3 seconds (Claude translation + PostGIS query)
- **Geographic coverage**: Results available in all 50 states (not just urban areas)
- **Fallback works**: Queries that don't map to exact billing codes still return relevant results via description search

### Engagement Signals (Post-Launch)

- Searches per session > 2 (users exploring multiple procedures/locations)
- Save rate > 10% of searches (users finding results worth bookmarking)
- Return visit rate within 7 days
- Search-to-map-view click rate (geographic exploration behavior)

---

## 10. Open Questions & Future Opportunities

### Open Questions

- **Data freshness cadence**: How often does Trilliant update Oria? What's the lag from hospital MRF update to Oria inclusion?
- **Accuracy validation**: How do we verify prices match actual hospital bills? Consider crowdsourced "what I actually paid" feature.
- **Claude cost optimization**: What's the per-search cost for billing code translation? May need caching layer for common queries.
- **Mobile experience**: PWA manifest exists but mobile-optimized layout needs testing and polish.

### Future Opportunities

- **Programmatic SEO pages**: Generate location + procedure pages (e.g., "/prices/knee-mri/houston-tx") for organic search acquisition
- **All-in cost estimation**: Build estimated total cost ranges by combining facility fee + typical professional fee percentages
- **Price alerts**: Notify users when prices drop at saved hospitals
- **Provider ratings integration**: Combine pricing data with quality/rating data for value-based comparison
- **Employer tools**: Dashboard for benefits teams to evaluate network cost efficiency
- **API access**: Offer pricing data as an API for health tech developers and researchers
- **State-level data**: Several states (CO, TX, FL) require non-hospital providers to report pricing — could accelerate Phase 9

---

## Document History

- **Created**: 2026-02-19
- **Source material**: Implementation plan (`imperative-wishing-brooks.md`), session context (`docs/session-context-2026-02-18.md`)
- **Author**: Chris Pratt + Claude Code
