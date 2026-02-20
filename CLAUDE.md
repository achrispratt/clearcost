# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ClearCost — a consumer-facing tool that translates plain English healthcare queries ("I need a knee MRI") into billing codes and returns real, localized hospital pricing comparisons. Think **Kayak for healthcare pricing**.

**Scope:** National (5,200+ hospitals), 1,010 curated procedure codes, cash prices + aggregated payer stats.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + DaisyUI 5
- **Database**: Supabase (Postgres with PostGIS for geo queries) — **NOT MongoDB/Mongoose**
- **Auth**: Supabase Auth (Google OAuth). Search is open; saving requires sign-in.
- **AI**: Claude API via Anthropic SDK (billing code translation)
- **Maps**: Google Maps JavaScript API
- **Data Pipeline**: DuckDB (local Parquet queries) + Trilliant Oria dataset
- **Deployment**: Vercel
- **PWA**: manifest.json for add-to-home-screen support

## Build & Development Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production (**see Machine Safety below**)
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (flat config v9, extends next/core-web-vitals + next/typescript)
- `npx tsx --env-file=.env.local lib/data/import-trilliant.ts` — Run data import pipeline

**No test framework is configured.** No Jest, Vitest, or test files exist. Do not attempt to run tests.

## Machine Safety

**DO NOT run `npm run build` during data import work or on memory-constrained machines.**
Next.js/Turbopack builds can consume 40GB+ RAM, causing the system to swap and freeze.

- To verify/type-check a script: run it directly with `npx tsx` and `--limit 100`
- To verify the web app compiles: only do this when explicitly deploying, not during data work
- `npm run build` and `npx tsx <script>` are completely unrelated — the build compiles the web app; tsx runs a standalone script
- If Node.js memory exceeds 500MB during any operation, something is wrong — kill it immediately

## Architecture: Search Flow

The critical path through the app — how a user query becomes price results:

```
User types "knee MRI near 90210"
  ↓
SearchBar component → navigates to /results?q=...&lat=...&lng=...
  ↓
Results page (app/results/page.tsx) → POST /api/search
  ↓
Step 1: translateQueryToCPT() (lib/cpt/translate.ts)
  Claude API interprets plain English → returns 1-5 billing codes (CPTCode[])
  Uses system prompt from lib/cpt/prompts.ts
  ↓
Step 2: lookupCharges() (lib/cpt/lookup.ts)
  Groups codes by type (CPT/HCPCS/MS-DRG)
  Calls Supabase RPC: search_charges_nearby(code_type, codes[], lat, lng, radius)
  PostGIS ST_DWithin() for geographic filtering
  ↓
Step 3 (fallback): lookupChargesByDescription()
  If code search returns 0 results → full-text search via search_charges_by_description()
  PostgreSQL ts_rank() for relevance scoring
  ↓
Results rendered: FilterBar + ResultsList/MapView toggle
  All filtering/sorting is client-side after initial fetch
```

## Architecture: Supabase Client Pattern

Three client types — using the wrong one causes auth/cookie bugs:

| Client | File | Context | Creation |
|--------|------|---------|----------|
| **Browser** | `lib/supabase/client.ts` | Client components, UI | `createBrowserClient(url, anonKey)` — sync |
| **Server** | `lib/supabase/server.ts` | Server Components, API routes | `await createClient()` — async, reads cookies |
| **Middleware** | `lib/supabase/middleware.ts` | `middleware.ts` only | Refreshes auth tokens on every request |

## Architecture: Auth Flow

1. `AuthButton` component calls `supabase.auth.signInWithOAuth({ provider: "google" })`
2. Google redirects to `/auth/callback` → server route exchanges code for session
3. `middleware.ts` runs on every request, calling `updateSession()` to refresh auth cookies
4. Protected features (save searches) check `supabase.auth.getUser()` in API routes
5. RLS on `saved_searches` table enforces `auth.uid() = user_id`

## Architecture: Directory Structure

```
app/
  api/search/         — Main search endpoint (query → codes → prices)
  api/cpt/            — Billing code translation only
  api/saved/          — Saved searches CRUD (requires auth)
  api/geocode/        — Location geocoding via Google Maps
  api/payers/         — Payer list for insurance dropdown
  auth/callback/      — Supabase OAuth callback handler
  results/            — Search results page
  saved/              — Saved searches page
components/           — UI: SearchBar, LocationInput, ResultCard, FilterBar, MapView, etc.
lib/
  anthropic.ts        — Claude API client singleton
  cpt/                — Translation logic (prompts.ts, translate.ts, lookup.ts)
  data/               — Import pipeline, code lists, DuckDB/Parquet data
  supabase/           — Three Supabase clients (browser, server, middleware)
scripts/              — DB migration utilities (full-migration.sql, run-migration-api.ts)
types/index.ts        — All shared TypeScript interfaces
supabase/schema.sql   — Full database schema (tables, RPC functions, indexes, RLS)
```

**Path alias:** `@/*` maps to project root (`@/lib/...`, `@/components/...`, `@/types/...`).

## Key Types (`types/index.ts`)

- `ChargeResult` — Main search result: provider + prices + billing codes + distance + negotiated rate stats
- `CPTCode` — AI-translated billing code: `{ code, description, category, codeType }`
- `Provider` — Hospital/facility with PostGIS location
- `PayerRate` — Insurance-specific negotiated rate
- `SearchResult` — Full API response: `{ cptCodes, results, interpretation, totalResults }`
- `SavedSearch` — User bookmark with RLS
- `BillingCodeType` = `'cpt' | 'hcpcs' | 'ms_drg'`
- **Deprecated aliases**: `PriceResult` → `ChargeResult`, `NegotiatedRate` → `PayerRate`

## Database (Supabase Postgres + PostGIS)

5 tables: `providers`, `charges`, `payer_rates`, `payers`, `saved_searches`

2 RPC functions:
- `search_charges_nearby(code_type, codes[], lat, lng, radius_km)` — primary code-based search
- `search_charges_by_description(search_terms, lat, lng, radius_km, limit)` — full-text fallback

Schema is in `supabase/schema.sql`. Project ref: `rzfelzmkdbicrfghofyf`.

## Key Concepts

- **MRF** = Machine Readable File (hospital pricing data, required by CMS since 2021)
- **CPT** = Current Procedural Terminology (procedure billing codes, e.g., 70553 = knee MRI)
- **HCPCS** = Healthcare Common Procedure Coding System (superset of CPT, adds supplies/drugs)
- **MS-DRG** = Diagnosis Related Groups (inpatient hospital stays)
- **PostGIS** = Spatial database extension for geographic queries (ST_DWithin for radius search)
- **Hybrid AI approach**: Claude interprets plain English → verified code lookup confirms codes → PostGIS queries prices by location
- **billing_class**: "facility", "professional", "Both", or null — determines what cost component a charge represents
- **All-in cost problem**: Hospital charges often represent only facility fees (~70-80% of total). Professional fees (radiologist, anesthesiologist) billed separately. MVP shows available price with smart contextual callouts.

## Data Source: Trilliant Oria

- **NOT DoltHub** — that was the original prototype data source (stale Q3 2023 data, NYC only)
- Trilliant Oria: national hospital MRF data lake, free download
- 6,039 hospitals total (5,419 with complete data)
- 274 million standard_charges rows, 6 billion payer-specific detail rows
- Local storage: 81GB Parquet files + 11MB DuckDB index in `lib/data/`
- Import filters to 1,010 curated codes, outpatient only, national scope → ~13.1M rows

### Import Technical Notes

- DuckDB needs `SET memory_limit = '4GB'` and `SET threads = 2` to avoid RAM exhaustion
- Many hospitals code under `hcpcs` column instead of `cpt` — always check BOTH
- DuckDB returns BigInt — wrap in `Number()` before passing to Supabase/JSON
- Oria DuckDB views use relative paths to `parquet/` — must CWD to `lib/data/` when querying
- State-by-state processing keeps DuckDB memory manageable
- Import script uses `db.stream()` (not `db.all()`) — never loads full state into JS heap

### MVP Data Scope

The MVP imports ~4.8% of the full Oria dataset:
- **274M total rows → ~13.1M imported** (1,010 codes × outpatient only)
- **6B payer detail rows → 0 imported** (using pre-aggregated avg/min/max instead)
- **120K+ distinct billing codes → 1,010 curated** (0.4% of unique codes)
- The 1,010 codes cover the most common shoppable procedures but the Parquet files contain 95%+ more data available for future phases
- Inpatient exclusion drops ~18.5% of all source rows (50.8M of 274M)
- Expansion path: more codes, inpatient, payer details → Phases 6-8 in roadmap
- Full breakdown with precise numbers: see `docs/prd.md` Section 4.2.1

### Data Import Workflow

**Fresh import** (wipe and reload all data):
```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts
```

**Resume import** (keep existing states, import remaining):
```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts \
  --skip-providers \
  --skip-states AK,AL,AR,AZ,CA,CO,CT,DC,DE,FL
```

**Test import** (verify script works with small dataset):
```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts \
  --skip-providers --state WY --limit 1000
```

**Key flags:**
- `--skip-providers` — providers already loaded, skip re-import
- `--skip-states AK,CA,...` — skip these states (preserves existing data, no DELETE)
- `--state NY` — only import one state
- `--limit 1000` — stop after N charges (for testing)
- `--batch-size 2000` — rows per Supabase insert (default: 2000)

**Memory**: Script uses streaming (`db.stream()`) + 3 concurrent inserts. Expected ~50-100MB heap. If it exceeds 500MB, something is wrong — kill it.

## Current Status

**Phases 1-5 code complete. Data import complete. Ready for deployment.**

- 5,419 providers imported (5,034 geocoded via zipcodes package, 385 missing zip)
- 1,010 curated codes in `lib/data/final-codes.json`
- **12,574,168 charges** imported across all 52 states (50 states + DC + PR)
- 7 indexes built (pkey + 6 custom: cpt, hcpcs, ms_drg, provider, cpt+provider, description GIN)
- ANALYZE run on charges table
- **Anthropic API key**: Required for live search (billing code translation).
- **Google Maps API key**: Required for map UI and geocoding.

## Environment Variables

See `.env.local.example` for required keys:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase admin access |
| `ANTHROPIC_API_KEY` | Claude API for billing code translation |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps (geocoding + map view) |

## Code Style & Guidelines

- **Imports**: Group by external packages, then internal using `@/` path alias
- **Types**: Use interfaces from `types/index.ts` — do not create parallel type definitions
- **Error Handling**: try/catch for async operations, display errors with `react-hot-toast`
- **API Routes**: Feature-organized in `app/api/`; use server Supabase client (async)
- **Formatting**: ESLint flat config (v9) extending next/core-web-vitals + next/typescript

## Design Direction

- Clean & clinical: white backgrounds, blue (#2563EB) accents, trustworthy feel
- Reference: Zocdoc, GoodRx aesthetic
- DaisyUI component library for consistent UI
- Light mode only for MVP

## Product Roadmap

| Phase | What | Status |
|-------|------|--------|
| **Phases 1-5 (MVP)** | Cash prices + aggregated payer stats, national scope, 1,010 codes | Complete (12.5M rows imported) |
| **Phase 6** | Independent MRF crawler (replace Trilliant dependency) | Deferred |
| **Phase 7** | Plan-level insurance pricing from hospital MRFs | Future |
| **Phase 8** | Payer Transparency in Coverage data — all provider types | Future |
| **Phase 9** | Non-hospital cash prices (crowdsourced/partnerships/state data) | Future |

See `docs/prd.md` for full product requirements.
