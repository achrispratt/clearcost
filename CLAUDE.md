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
- **AI**: Claude API via Anthropic SDK (billing code translation). Models the product calls are defined in `lib/ai/models.ts`
- **Maps**: Google Maps JavaScript API
- **Data Pipeline**: DuckDB (local Parquet queries) + Trilliant Oria dataset
- **Analytics**: PostHog (`posthog-js`), conversion events via `track()` in `lib/analytics.ts`. Off unless `NEXT_PUBLIC_POSTHOG_KEY` is set
- **Error tracking**: Sentry (`@sentry/nextjs`), wired in `instrumentation.ts` / `instrumentation-client.ts`; caught server errors go through `reportError()` in `lib/observability.ts`. Off unless a DSN is set
- **Deployment**: Vercel
- **PWA**: manifest.json for add-to-home-screen support

## Build & Development Commands

- `npm run dev` — Start development server
- `npm run build` — Build for production (**see Machine Safety below**)
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (flat config v9, extends next/core-web-vitals + next/typescript)
- `npm test` — Run Vitest test suite (unit + API route integration)
- `npm run test:watch` — Run tests in watch mode during development
- `npx tsx --env-file=.env.local lib/data/import-trilliant.ts` — Run data import pipeline

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
Guided Search page (app/guided-search/page.tsx) → POST /api/clarify (every turn)
  ↓
Step 0: kbLookup() (lib/kb/lookup.ts)
  Normalize query → hash → check kb_synonyms for canonical form
  Build path_hash (query + answer_path) → check kb_nodes for cached response
  If KB hit → return cached question/resolution (zero AI cost)
  If KB miss → fall through to Claude
  ↓
Step 1: Claude (lib/cpt/translate.ts)
  Turn 0: assessQuery() → first diagnostic question (depth-0 is always a question)
  Turn N: clarifyQuery() → next question, or resolve to codes (prompt targets max 6 turns)
  Write-back: store synonym + node in KB for future lookups
  If the Claude call fails → translateQueryToCPT() single-shot fallback
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
- **API routes**: `/api/clarify` (multi-turn guided search), `/api/search` (accepts direct codes). Inputs capped server-side in `lib/api-limits.ts`

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
  api/clarify/        — Multi-turn clarification Q&A endpoint
  api/kb/events/      — KB interaction event logging (clicks, saves, bounces)
  api/saved/          — Saved searches CRUD (requires auth)
  api/geocode/        — Location geocoding via Google Maps
  api/payers/         — Payer list for insurance dropdown
  auth/callback/      — Supabase OAuth callback handler
  guided-search/      — Diagnostic clarification page (pre-results Q&A)
  legal/              — Legal pages: Terms of Service, Privacy Policy, Medical Disclaimers
  prices/             — SEO price pages: /prices, /prices/[procedure], /prices/[procedure]/[city], /prices/in/[city]
  results/            — Search results page
  saved/              — Saved searches page
components/
  landing/            — Homepage sections: HeroSection, HowItWorks, WhyClearCost, SearchCategories, DataQuality
  Footer.tsx          — Site-wide footer with legal links
  ...                 — SearchBar, LocationInput, ResultCard, FilterBar, MapView, ClarificationStep, etc.
lib/
  ai/models.ts        — Models the product calls, one entry per job
  anthropic.ts        — Claude API client singleton
  cpt/                — Translation logic (prompts.ts, translate.ts, lookup.ts)
  kb/                 — Translation Knowledge Base (lookup.ts, write-back.ts, events.ts, path-hash.ts, path-report.ts)
  seo/                — SEO price pages: curated procedures + metros, page-index.json (which pages publish)
  data/               — Import pipeline, code lists, DuckDB/Parquet data
  data-checks/        — Before/after snapshots of what patients see + per-hospital coverage, and their comparison (scripts/data-check.ts, docs/data-checks.md)
  crawler/            — Independent MRF crawler (cms-hpt.txt discovery, streaming JSON/CSV parse, charges-shape rows); CLI: scripts/crawl-mrf.ts, docs/mrf-crawler.md
  supabase/           — Three Supabase clients (browser, server, middleware)
scripts/              — DB migration utilities + one-time audit/fix scripts from data quality phase
#                       Active/reusable: data-check.ts, db-audit.ts, stability-smoke.ts, seed-kb.ts, kb-path-report.ts, migrate-translation-cache.ts, build-seo-index.ts, crawl-mrf.ts, build-hospital-websites.ts, archive-to-storage.ts
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
- `KBLookupResult` — KB cache hit/miss result with optional node (`flagged: true` when the node exists but is flagged)
- Legacy aliases (`PriceResult`, `NegotiatedRate`) have been removed

## Database (Supabase Postgres + PostGIS)

5 core tables: `providers`, `charges`, `payer_rates`, `payers`, `saved_searches`
5 KB tables: `kb_synonyms`, `kb_nodes`, `kb_events`, `kb_path_stats`, `kb_node_history` (see Translation KB below)

KB jobs (pg_cron, daily UTC, migration `20261015050000_kb_growth_machinery.sql`): `kb_rollup_path_stats()` 03:00 (previous + current month, distinct sessions, idempotent upsert) → `kb_flag_resolution_nodes()` 03:15 → `kb_purge_old_events()` 03:30 (rolls up first, then deletes only whole months older than both 30 days and the previous month). View `kb_resolution_confidence` = per resolution node per month rates + #126 confidence score. All service-role only.

Price data-quality counts (pg_cron, daily 04:30 UTC, after the 04:00 `refresh_code_price_reference()`): `snapshot_data_quality()` counts the rows the price filters hide or flag in one fourteenth of `charges`' pages each night (`data_quality_slice_counts`) and writes the per-source totals across all 14 slices to `data_quality_counts` (migration `20261021070000_data_quality_counts_by_slice.sql`). Never full-scan `charges` from a cron job: it can't finish in the 2-minute cap and exhausts Micro's disk IO burst. Service-role only.

Load check: `coverage_fingerprint(provider_ids)` gives per-code row counts and price ranges for a set of hospitals, read by `scripts/data-check.ts snapshot` (migration `20261019230000_coverage_ledger.sql`, service-role only). The nightly ledger from that migration (`snapshot_coverage()`, `provider_coverage`, `code_coverage`, `coverage_drops()`) is unscheduled and its tables are empty: no nightly job may scan all of `charges`, because on Micro compute that drains the disk IO burst and stalls the database. See `docs/data-checks.md`.

2 RPC functions:

- `search_charges_nearby(code_type, codes[], lat, lng, radius_km)` — primary code-based search
- `search_charges_by_description(search_terms, lat, lng, radius_km, limit)` — full-text fallback

Schema is in `supabase/schema.sql`. Project ref: `rzfelzmkdbicrfghofyf`.

## Key Concepts

- **Billing code reference**: See `docs/billing-code-guide.md` for code structure, charge anatomy, and data interpretation rules
- **billing_class**: "facility", "professional", "Both", or null — determines what cost component a charge represents
- **All-in cost problem**: Hospital charges often represent only facility fees (~70-80% of total). Professional fees (radiologist, anesthesiologist) billed separately. MVP shows available price with smart contextual callouts.
- **Impossible-price filter**: `lib/cpt/price-bands.ts` treats a cash, insured or too-low list price more than 10x off its code's national typical price (`code_price_reference`, refreshed nightly by pg_cron) as missing, on top of the placeholder rule in `lib/cpt/price-sanity.ts`. A stay (MS-DRG) price more than 4x under its DRG's typical whole-stay price (key `drg:<code>`, from crawled hospital files only) is treated the same way
- **Hybrid AI approach**: Claude interprets plain English → verified code lookup confirms codes → PostGIS queries prices by location
- **Translation Knowledge Base (KB)**: Caches AI translation results as a conversation tree. Synonym table maps variant phrasings ("mri knee" → "knee mri") to canonical queries. Node table stores each query+answer_path as a tree node. Repeat searches skip Claude entirely (zero AI cost). Synonym clustering links new queries to existing trees when semantically equivalent. See `lib/kb/` for implementation.
- **KB quality loop (#125–#127)**: nodes are first-write-wins, except a resolution node auto-flagged by `kb_flag_resolution_nodes()` (≥50 walks this month, bounce > 25%, bounce rising 2 months running). `kbLookup()` treats a flagged node as a miss (a wrong match is worse than none), Claude re-answers the path, and `writeNode()` calls the `kb_replace_flagged_node` RPC, which archives the old version to `kb_node_history`, bumps `version` and clears the flag. `/api/clarify` logs a server-only `miss` event (path_hash = query hash) on first-turn misses. Review with `npx tsx --env-file=.env.local scripts/kb-path-report.ts` (flagged nodes, high-bounce paths, median bounce) or `--emerging` (repeated misses, fast-growing canonicals). No admin notifications and no A/B testing yet.

## Data Source: Trilliant Oria

- **NOT DoltHub** — that was the original prototype data source (stale Q3 2023 data, NYC only)
- Trilliant Oria: national hospital MRF data lake, free download
- 6,039 hospitals total (5,419 with complete data)
- 274 million standard_charges rows, 6 billion payer-specific detail rows
- Local storage: 81GB Parquet files + 11MB DuckDB index in `lib/data/`
- Import filters to 1,002 curated codes, all settings, national scope → ~8.15M rows (after dedup)

### Import Details

Import pipeline uses `import-trilliant.ts` (Node.js INSERT via Supabase pooler port 6543). MVP imports ~4.8% of full Oria dataset (1,002 codes × all settings → ~8.15M rows after dedup). Setting filter was removed — code list is the quality gate. See `docs/prd.md` Section 4.2.1 for data scope breakdown.

**Around every import, load or data change:** take a `scripts/data-check.ts snapshot` before and after and `compare` them (`docs/data-checks.md`); a failure means stop and look before the next change.

**After every import:** the import refreshes cash ratios for the hospitals it loaded (never run the no-argument `refresh_provider_cash_ratios()`, which times out on the full table). Rebuild the SEO page index (`npx tsx --env-file=.env.local scripts/build-seo-index.ts`) and commit `lib/seo/page-index.json`. The index decides which procedure + city pages publish (3+ priced hospitals within 25 miles, prices more than 10x off the national typical left out).

**Full import reference** (flags, DuckDB quirks, resume workflow, gotchas): see `docs/import-reference.md`

## Data Architecture Principles

**Prefer bringing the calculation to the data, not the data to the calculation.**
When possible and optimal, push reference data and logic into SQL (temp tables, CTEs, JOINs) rather than pulling large result sets to Node.js for local processing. This minimizes network transfer, respects Supabase Pro CPU/IO limits, and leverages Postgres's query optimizer. Not a hard rule — sometimes client-side processing is simpler or necessary (e.g., when logic depends on npm packages with no SQL equivalent). Use judgment.

## Design System

Always read [`DESIGN.md`](./DESIGN.md) before making any visual or UI decisions. All font choices, colors, spacing, and aesthetic direction are defined there. Do not deviate without explicit user approval. In QA mode, flag any code that doesn't match DESIGN.md.

## Code Style, Git Workflow & Design

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) — the single source of truth for code conventions, git workflow, branch naming, issue management, and environment setup. Read it before writing code.

## Roadmap & Work Tracking

GitHub Issues are the source of truth for work tracking. See `docs/prd.md` for full product requirements and phase history.
