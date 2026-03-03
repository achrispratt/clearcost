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
Step 1: translateQueryToCPT() (lib/cpt/translate.ts)
  Claude API assesses the query → returns confidence level + billing codes
  If confidence "high" → redirect to /results with codes
  If confidence "low"  → show clarifying questions (one at a time)
  ↓
Step 1b (if clarification needed): Multi-turn Q&A loop
  POST /api/clarify with query + previous answers
  Claude generates next question based on full context
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
  api/cpt/            — Billing code translation (single-shot assessment)
  api/clarify/        — Multi-turn clarification Q&A endpoint
  api/saved/          — Saved searches CRUD (requires auth)
  api/geocode/        — Location geocoding via Google Maps
  api/payers/         — Payer list for insurance dropdown
  auth/callback/      — Supabase OAuth callback handler
  guided-search/      — Diagnostic clarification page (pre-results Q&A)
  results/            — Search results page
  saved/              — Saved searches page
components/           — UI: SearchBar, LocationInput, ResultCard, FilterBar, MapView, ClarificationStep, etc.
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
- Legacy aliases (`PriceResult`, `NegotiatedRate`) have been removed

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
- Import filters to 1,002 curated codes, all settings, national scope → ~13.1M rows

### Import Technical Notes

- DuckDB needs `SET memory_limit = '2GB'` and `SET threads = 2` to avoid RAM exhaustion (note: `generate-snapshot.ts` uses `4GB` — it runs alone, not during imports)
- Many hospitals code under `hcpcs` column instead of `cpt` — always check BOTH
- DuckDB returns BigInt — wrap in `Number()` before passing to Supabase/JSON
- Oria DuckDB views use relative paths to `parquet/` — must CWD to `lib/data/mrf_lake/` when querying
- State-by-state processing keeps DuckDB memory manageable
- Import script uses `db.stream()` (not `db.all()`) — never loads full state into JS heap
- **Auto-resume trap**: `--limit N` test runs mark a state as "completed" in auto-resume. DELETE test rows before full import or the state gets skipped.
- **`final-codes.json` format**: Flat `string[]`, not `{code: string}[]`. Scripts consume values directly.
- **DuckDB ↔ Supabase column mismatch**: DuckDB uses `hospital_state` on both tables; Supabase uses `state` on `providers`.

### MVP Data Scope

The MVP imports ~4.8% of the full Oria dataset:
- **274M total rows → ~13.1M imported** (1,002 codes × all settings)
- **6B payer detail rows → 0 imported** (using pre-aggregated avg/min/max instead)
- **120K+ distinct billing codes → 1,002 curated** (0.4% of unique codes)
- The 1,002 codes cover the most common shoppable procedures but the Parquet files contain 95%+ more data available for future phases
- **Setting filter removed**: the code list defines shoppability, not the setting label. Investigation showed ~895K inpatient rows in source data are 100% duplicates of existing outpatient rows (same hospital, same code, same price). No backfill needed. See #41.
- Expansion path: more codes, payer details → Phases 6-8 in roadmap
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

**Phases 1-5.6 complete. Data import complete for all 52 states/DC/PR. Deployed to Vercel.**

- **Live URL:** https://clearcost-orcin.vercel.app
- Search pipeline working end-to-end (Claude AI translation → Supabase geo query → results)
- Data import complete. See `docs/data-snapshot.md` for current numbers.
- 1,002 curated codes in `lib/data/final-codes.json`
- 7 indexes built (pkey + 6 custom: cpt, hcpcs, ms_drg, provider, cpt+provider, description GIN)
- **Anthropic API key**: Required for live search (billing code translation).
- **Google Maps API key**: Required for map UI and geocoding.

**Work tracking:** GitHub Issues are the source of truth (issue # = priority). Current focus: data quality (#6-#12), then frontend polish (#13-#19), then pre-launch (#20-#23).

## Environment Variables

See `.env.local.example` for required keys:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase admin access |
| `ANTHROPIC_API_KEY` | Claude API for billing code translation |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps (geocoding + map view) |

## Data Architecture Principles

**Prefer bringing the calculation to the data, not the data to the calculation.**
When possible and optimal, push reference data and logic into SQL (temp tables, CTEs, JOINs) rather than pulling large result sets to Node.js for local processing. This minimizes network transfer, respects Supabase Pro CPU/IO limits, and leverages Postgres's query optimizer. Not a hard rule — sometimes client-side processing is simpler or necessary (e.g., when logic depends on npm packages with no SQL equivalent). Use judgment.

## Code Style & Guidelines

- **Imports**: Group by external packages, then internal using `@/` path alias
- **Types**: Use interfaces from `types/index.ts` — do not create parallel type definitions
- **Error Handling**: try/catch for async operations, display errors with `react-hot-toast`
- **API Routes**: Feature-organized in `app/api/`; use server Supabase client (async)
- **Formatting**: ESLint flat config (v9) extending next/core-web-vitals + next/typescript

## Git Workflow & Development Practices

This is a solo-developer project. Workflow should be simple and low-friction, but tracked via GitHub Issues and PRs.

**Issue-Driven Workflow:**
All work is tracked via GitHub Issues on the [ClearCost MVP project board](https://github.com/users/achrispratt/projects/2). The standard flow:
1. Pick an issue (user says "work on #7" or similar)
2. Read the issue with `gh issue view <number>`
3. Create a feature branch: `git checkout -b <type>/<short-description>` (e.g., `data/import-nj-charges`, `fix/payer-filter-removal`, `feat/loading-skeletons`)
4. Do the work — commit frequently with clear messages
5. Push and open a PR with `gh pr create`, linking the issue (use "Closes #N" in the PR body)
6. User reviews and merges — issue auto-closes on merge

**Branch Naming:**
- `data/` — data pipeline, import, quality work
- `feat/` — new features, UI additions
- `fix/` — bug fixes
- `infra/` — security, deployment, tooling
- `refactor/` — code cleanup, no behavior change

**Branching Rules:**
- **Always use feature branches + PRs** for issue-tracked work. This keeps `main` clean and creates an audit trail.
- **Commit directly to `main` only for** trivial fixes (typos, comment updates, CLAUDE.md changes) that don't warrant a PR.
- Keep branches short-lived (merge within 1-2 sessions). Stale branches create confusion.

**Commits:**
- Commit frequently with clear messages. Small, focused commits are easier to review and revert.
- Don't batch up many unrelated changes into one commit.

**Merging:**
- Merging a behind branch into `main` is safe — Git combines histories, it doesn't overwrite. The only dangerous operation is `git push --force`.
- When in doubt about branch state: `git log --oneline main..branch-name` shows what the branch adds.

**Planning & Docs:**
- Planning documents (`docs/sprint-plan.md`, etc.) go directly on `main`. They don't need branch isolation.
- This file (`CLAUDE.md`) is the primary source of institutional knowledge across sessions. Update it when decisions are made, patterns are established, or the project state changes.
- Claude Code has **no memory across sessions** — anything not in repo files is lost. Keep CLAUDE.md current.

**Sprint planning:**
- GitHub Issues are the source of truth for work tracking. Issue # = priority order.
- Sprint plan (`docs/sprint-plan.md`) is archived — all details rationalized into issues.
- Priorities shift frequently in a solo project. Reorder issues when priorities change.

## Design Direction

- **Warm editorial aesthetic**: warm whites (#FAFAF8), teal primary (#0F766E), amber accents (#D97706)
- Typography: Instrument Serif for headings, DM Sans for body
- Reference: Zocdoc, GoodRx — trustworthy, clean, approachable
- DaisyUI component library for consistent UI
- Light mode only for MVP
- CSS custom properties defined in `globals.css` (prefixed `--cc-*`) — use these, not raw colors

## Visual Learning — ClearCost-Specific

When explaining changes to the search flow, guided search, or any part of the query-to-results pipeline, **always include an ASCII diagram** of the affected portion of the pipeline. The search flow is the critical path through the app and visual context prevents misunderstandings.

Specifically, diagram the pipeline when changes touch:
- `SearchBar` → `/guided-search` → `/results` navigation flow
- `/api/cpt`, `/api/clarify`, or `/api/search` request/response paths
- `translateQueryToCPT()` → `lookupCharges()` → results rendering
- The guided search state machine (turns, resolution states, back navigation)
- Supabase RPC calls (`search_charges_nearby`, `search_charges_by_description`)

Show where in the pipeline the change lives and what it affects downstream. Reference the full pipeline in the "Architecture: Search Flow" section above as the canonical diagram.

## Product Roadmap

| Phase | What | Status |
|-------|------|--------|
| **Phases 1-5 (MVP)** | Cash prices + aggregated payer stats, national scope, 1,002 codes | Complete |
| **Phase 5.5** | Guided Search — AI diagnostic clarification flow + UX polish | Complete |
| **Phase 5.6** | Results page — split view, setting filter removal, search optimization, codebase refactor | Complete |
| **Data Quality** | Unknown-state providers, geocode backfill, dedup, pipeline hardening (#6-#12) | In Progress |
| **Frontend Polish** | Skeletons, billing callouts, distance filter, mobile UX (#13-#19) | Planned |
| **Pre-Launch** | Security headers, rate limiting, verification checklist (#20-#23) | Planned |
| **Phase 6** | Independent MRF crawler (replace Trilliant dependency) | Deferred |
| **Phase 7** | Plan-level insurance pricing from hospital MRFs | Future |
| **Phase 8** | Payer Transparency in Coverage data — all provider types | Future |
| **Phase 9** | Non-hospital cash prices (crowdsourced/partnerships/state data) | Future |

**Future UX enhancements** (tracked as backlog issues #32-#37):
- Smart typeahead/suggestions in search bar (#32)
- Conversational follow-up for deeply ambiguous queries
- Results grouped by procedure type when query isn't fully resolved
- Educational content: "How to work with your doctor to understand what you need"
- Scheduling integration (e.g., Zocdoc partnership — ClearCost finds prices, they handle booking)
- Primary care funnel for symptom-based users

See `docs/prd.md` for full product requirements.
