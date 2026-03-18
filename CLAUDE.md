# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ClearCost — a consumer-facing tool that translates plain English healthcare queries ("I need a knee MRI") into billing codes and returns real, localized hospital pricing comparisons. Think **Kayak for healthcare pricing**.

**Scope:** National (5,400+ hospitals), 1,002 curated procedure codes, cash prices + aggregated payer stats.

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
User types query on homepage
  ↓
SearchBar component → navigates to /guided-search?q=...&lat=...&lng=...
  ↓
Guided Search page (app/guided-search/page.tsx) → POST /api/cpt
  ↓
Step 0: kbLookup() (lib/kb/lookup.ts)
  Normalize query → hash → check kb_synonyms for canonical form
  Build path_hash → check kb_nodes for cached response
  If KB hit (resolution node) → return cached codes immediately (zero AI cost)
  If KB miss → fall through to Claude
  ↓
Step 1: translateQueryToCPT() (lib/cpt/translate.ts)
  Claude API assesses the query → returns confidence level + billing codes
  Write-back: store synonym + node in KB for future lookups
  If confidence "high" → redirect to /results with codes
  If confidence "low"  → show clarifying questions (one at a time)
  ↓
Step 1b (if clarification needed): Multi-turn Q&A loop
  POST /api/clarify with query + previous answers
  KB checked at each turn (query + answer_path → path_hash)
  Claude generates next question based on full context
  Each turn written back to KB as a conversation tree node
  Repeats until Claude resolves to specific codes (max 6 turns)
  ↓
Navigate to /results?q=...&codes=73721&codeType=cpt&lat=...&lng=...
  ↓
Results page (app/results/page.tsx) → POST /api/search
  ↓
Step 2: lookupCharges() (lib/cpt/lookup.ts)
  If codes provided → direct lookup (skip translation)
  Otherwise → translate then lookup (legacy path)
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

### Guided Search Clarification Flow

The guided search is an AI-driven diagnostic conversation that helps users narrow vague queries to specific billing codes. Key design:

- **Multi-turn loop**: Each answer + conversation history goes back to Claude for the next question
- **Step-by-step UI**: One question at a time, breadcrumb summary of previous answers, back button
- **Hybrid knowledge**: System prompt contains clinical triage protocols (the moat) + Claude's medical knowledge
- **Three resolution states** after max 6 turns:
  1. Confident → specific codes → results
  2. Category → knows the area → show grouped results
  3. Unclear → suggest primary care visit (with option to search anyway)
- **Handles all user types**: referral holders, self-directed, symptom-based
- **API routes**: `/api/cpt` (single-shot), `/api/clarify` (multi-turn), `/api/search` (accepts direct codes)

## Architecture: Supabase Client Pattern

Three client types — using the wrong one causes auth/cookie bugs:

| Client         | File                         | Context                       | Creation                                      |
| -------------- | ---------------------------- | ----------------------------- | --------------------------------------------- |
| **Browser**    | `lib/supabase/client.ts`     | Client components, UI         | `createBrowserClient(url, anonKey)` — sync    |
| **Server**     | `lib/supabase/server.ts`     | Server Components, API routes | `await createClient()` — async, reads cookies |
| **Middleware** | `lib/supabase/middleware.ts` | `middleware.ts` only          | Refreshes auth tokens on every request        |

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
  api/cpt/            — Billing code translation (single-shot assessment)
  api/clarify/        — Multi-turn clarification Q&A endpoint
  api/kb/events/      — KB interaction event logging (clicks, saves, bounces)
  api/saved/          — Saved searches CRUD (requires auth)
  api/geocode/        — Location geocoding via Google Maps
  api/payers/         — Payer list for insurance dropdown
  auth/callback/      — Supabase OAuth callback handler
  guided-search/      — Diagnostic clarification page (pre-results Q&A)
  legal/              — Legal pages: Terms of Service, Privacy Policy, Medical Disclaimers
  results/            — Search results page
  saved/              — Saved searches page
components/
  landing/            — Homepage sections: HeroSection, HowItWorks, WhyClearCost, SearchCategories, DataQuality
  Footer.tsx          — Site-wide footer with legal links
  ...                 — SearchBar, LocationInput, ResultCard, FilterBar, MapView, ClarificationStep, etc.
lib/
  anthropic.ts        — Claude API client singleton
  cpt/                — Translation logic (prompts.ts, translate.ts, lookup.ts)
  kb/                 — Translation Knowledge Base (lookup.ts, write-back.ts, events.ts, path-hash.ts)
  data/               — Import pipeline, code lists, DuckDB/Parquet data
  supabase/           — Three Supabase clients (browser, server, middleware)
scripts/              — DB migration utilities + one-time audit/fix scripts from data quality phase
#                       Active/reusable: db-audit.ts, stability-smoke.ts, seed-kb.ts, migrate-translation-cache.ts
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
- `KBNode` — Knowledge Base conversation tree node (question or resolution)
- `KBSynonym` — Query normalization: maps variant phrasings to a canonical query
- `KBLookupResult` — KB cache hit/miss result with optional node
- Legacy aliases (`PriceResult`, `NegotiatedRate`) have been removed

## Database (Supabase Postgres + PostGIS)

5 core tables: `providers`, `charges`, `payer_rates`, `payers`, `saved_searches`
4 KB tables: `kb_synonyms`, `kb_nodes`, `kb_events`, `kb_path_stats` (see Translation KB below)

2 RPC functions:

- `search_charges_nearby(code_type, codes[], lat, lng, radius_km)` — primary code-based search
- `search_charges_by_description(search_terms, lat, lng, radius_km, limit)` — full-text fallback

Schema is in `supabase/schema.sql`. Project ref: `rzfelzmkdbicrfghofyf`.

## Key Concepts

- **Billing code reference**: See `docs/billing-code-guide.md` for code structure, charge anatomy, and data interpretation rules
- **billing_class**: "facility", "professional", "Both", or null — determines what cost component a charge represents
- **All-in cost problem**: Hospital charges often represent only facility fees (~70-80% of total). Professional fees (radiologist, anesthesiologist) billed separately. MVP shows available price with smart contextual callouts.
- **Hybrid AI approach**: Claude interprets plain English → verified code lookup confirms codes → PostGIS queries prices by location
- **Translation Knowledge Base (KB)**: Caches AI translation results as a conversation tree. Synonym table maps variant phrasings ("mri knee" → "knee mri") to canonical queries. Node table stores each query+answer_path as a tree node. Repeat searches skip Claude entirely (zero AI cost). Synonym clustering links new queries to existing trees when semantically equivalent. See `lib/kb/` for implementation.

## Data Source: Trilliant Oria

- **NOT DoltHub** — that was the original prototype data source (stale Q3 2023 data, NYC only)
- Trilliant Oria: national hospital MRF data lake, free download
- 6,039 hospitals total (5,419 with complete data)
- 274 million standard_charges rows, 6 billion payer-specific detail rows
- Local storage: 81GB Parquet files + 11MB DuckDB index in `lib/data/`
- Import filters to 1,002 curated codes, all settings, national scope → ~8.15M rows (after dedup)

### Import Details

Import pipeline uses `import-trilliant.ts` (Node.js INSERT via Supabase pooler port 6543). MVP imports ~4.8% of full Oria dataset (1,002 codes × all settings → ~8.15M rows after dedup). Setting filter was removed — code list is the quality gate. See `docs/prd.md` Section 4.2.1 for data scope breakdown.

**Full import reference** (flags, DuckDB quirks, resume workflow, gotchas): see `docs/import-reference.md`

## Current Status

**Phases 1-5.6 complete. Data quality sprint complete. Translation KB + Legal pages shipped. Deployed to Vercel.**

- **Live URL:** https://clearcost-orcin.vercel.app
- Search pipeline working end-to-end. See `docs/data-snapshot.md` for current numbers.
- **Translation KB:** Repeat searches served from cache (zero AI cost). Synonym clustering links variant phrasings.
- **Legal:** Terms of Service, Privacy Policy, Medical Disclaimers pages live.
- **Homepage:** Redesigned as 6-section landing page (Hero, How It Works, Why ClearCost, Search Categories, Data Quality, Footer).
- **Current phase:** Frontend polish (#13–#19)
- **Work tracking:** GitHub Issues are the source of truth (issue # = priority)

## Data Architecture Principles

**Prefer bringing the calculation to the data, not the data to the calculation.**
When possible and optimal, push reference data and logic into SQL (temp tables, CTEs, JOINs) rather than pulling large result sets to Node.js for local processing. This minimizes network transfer, respects Supabase Pro CPU/IO limits, and leverages Postgres's query optimizer. Not a hard rule — sometimes client-side processing is simpler or necessary (e.g., when logic depends on npm packages with no SQL equivalent). Use judgment.

## Code Style, Git Workflow & Design

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) — the single source of truth for code conventions, git workflow, branch naming, issue management, design system, and environment setup. Read it before writing code.

## Product Roadmap

| Phase                | What                                                                                      | Status   |
| -------------------- | ----------------------------------------------------------------------------------------- | -------- |
| **Phases 1-5 (MVP)** | Cash prices + aggregated payer stats, national scope, 1,002 codes                         | Complete |
| **Phase 5.5**        | Guided Search — AI diagnostic clarification flow + UX polish                              | Complete |
| **Phase 5.6**        | Results page — split view, setting filter removal, search optimization, codebase refactor | Complete |
| **Data Quality**     | Unknown-state providers, geocode backfill, dedup, pipeline hardening (#6-#12)             | Complete |
| **Translation KB**   | Knowledge Base caching, synonym clustering, zero-AI repeat searches                       | Complete |
| **Legal & Landing**  | Terms/Privacy/Disclaimers pages, homepage redesign, Footer                                | Complete |
| **Frontend Polish**  | Skeletons, billing callouts, distance filter, mobile UX (#13-#19)                         | Planned  |
| **Pre-Launch**       | Security headers, rate limiting, verification checklist (#20-#23)                         | Planned  |
| **Phase 6**          | Independent MRF crawler (replace Trilliant dependency)                                    | Deferred |
| **Phase 7**          | Plan-level insurance pricing from hospital MRFs                                           | Future   |
| **Phase 8**          | Payer Transparency in Coverage data — all provider types                                  | Future   |
| **Phase 9**          | Non-hospital cash prices (crowdsourced/partnerships/state data)                           | Future   |

**Future UX enhancements** (tracked as backlog issues #32-#37):

- Smart typeahead/suggestions in search bar (#32)
- Conversational follow-up for deeply ambiguous queries
- Results grouped by procedure type when query isn't fully resolved
- Educational content: "How to work with your doctor to understand what you need"
- Scheduling integration (e.g., Zocdoc partnership — ClearCost finds prices, they handle booking)
- Primary care funnel for symptom-based users

See `docs/prd.md` for full product requirements.
