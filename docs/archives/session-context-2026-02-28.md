# ClearCost Session Context — Feb 28, 2026

## Summary

Massive productivity day across multiple workstreams (Claude Code + Codex). 17 commits spanning search reliability improvements, Phase 5.6 split-view layout, a major codebase refactor, pricing plan implementation, result card polish, and a search bar UI fix. The app is materially better across every layer: faster searches, cleaner code, better UX.

## What Was Accomplished Today

### 1. Search Reliability Improvements (Morning — Codex)

**Commit:** `faf74be` — Improve search reliability

- `lookupCharges()` now searches HCPCS column for CPT codes (hospitals often file CPT under HCPCS)
- Auto-expand search radius 3x when initial search returns 0 results before falling back to description search
- SearchBar and LocationInput accept `initialLocation`/`initialValue` props to persist location across page navigations
- Guided search page passes location to compact SearchBar

### 2. Phase 5.6: Split View Layout + Remove Setting Filter (Morning — Codex)

**Commit:** `aa37f3b` — Phase 5.6 split view

- Results page now shows list + map side-by-side on desktop (Zillow/Airbnb pattern)
- Desktop (>=1024px): list 55% left, map 45% right (sticky)
- List scrolls independently, map stays fixed in viewport
- Toggle pills hidden on desktop, visible on mobile
- Marker click highlights card (teal ring + scroll into view, auto-clears 3s)
- Selected marker turns amber on map
- Removed non-functional inpatient/outpatient setting filter (MVP is outpatient-only)
- Cleaned up `SettingFilter` type, state, filter logic, and dead `onSortChange` prop from FilterBar

### 3. Search Optimization — Cross-Column Lookup in Postgres (Morning — Codex)

**Commits:** `e8b7cbd`, `4016ea8`

- Moved cross-column CPT/HCPCS search logic from app layer (2 sequential HTTP round-trips) into the Postgres RPC function (single query with BitmapOr)
- ~50% latency reduction for CPT code lookups
- Parallelized multi-type lookups with `Promise.all`
- Added `idx_charges_hcpcs_provider` composite index
- Added `launch.json` for dev server config + migration script

### 4. Major Codebase Refactor (Morning — Codex)

**Commits:** `3b7be0f` through `2bd86e0` (7 commits)

Foundation cleanup across the entire codebase:
- **Shared utilities**: Foundation utility modules for codebase cleanup
- **API route dedup**: Consolidated API route duplication with shared helpers
- **Supabase config**: Deduplicated Supabase config, extracted `translate.ts` code
- **Custom hooks**: Extracted custom hooks from results and guided-search pages
- **Component cleanup**: CSS hover fixes, SearchBar dedup, formatted imports
- **Dead code removal**: Removed dead code, fixed config, dropped unused dependency
- **Performance**: Memoized payer alias map to avoid rebuilding on every call

### 5. Search Correctness Fix (Afternoon — Codex)

**Commit:** `5369647` — Fix search correctness and resilience in guided/results flow

Bug fixes in the search pipeline ensuring correct results flow through the guided search and results pages.

### 6. Encounter-First Pricing Plan (Afternoon — Codex)

**Commit:** `9dea3dc` — Implement encounter-first pricing plan with conditional adders

New pricing logic in `lib/cpt/pricing-plan.ts` that structures costs as encounter-first with conditional adders — more intuitive representation of how healthcare pricing actually works.

### 7. Result Card Polish (Evening — Codex)

**Commit:** `9e0751e` — Standardize CPT code descriptions on result cards

Normalized how CPT code descriptions display on result cards for consistency.

### 8. Relevance & Location Regression Fix (Evening — Codex)

**Commit:** `1277048` — Fix relevance and location consistency regressions

Fixed regressions introduced by earlier changes — relevance scoring and location consistency were off.

### 9. Search Bar Text Cutoff Fix (Evening — Claude Code)

**Commits:** `f47db42`, `d766d74` — PR #2 (merged)

- **Root cause:** Hero content wrapper in `page.tsx` had `flex flex-col items-center max-w-3xl` but no `w-full`. The wrapper shrank to heading text width (~527px) instead of filling to 768px, starving the search bar of horizontal space.
- **Fix:** Added `w-full` to the wrapper div, narrowed location input `sm:w-52` → `sm:w-44`
- Added `.playwright-cli/` to `.gitignore`
- Also added `autoPort: true` to `launch.json` for dev server flexibility

## Key Files Modified Today

| Area | Files |
|------|-------|
| Search pipeline | `lib/cpt/lookup.ts`, `lib/cpt/translate.ts`, API routes |
| Pricing | `lib/cpt/pricing-plan.ts` |
| Results UI | `app/results/page.tsx`, `components/FilterBar.tsx`, `components/MapView.tsx`, `components/ResultCard.tsx` |
| Search bar | `components/SearchBar.tsx`, `components/LocationInput.tsx` |
| Homepage | `app/page.tsx` |
| Data import | `lib/data/import-trilliant.ts` |
| Database | Postgres RPC migration for cross-column lookup |
| Config | `.claude/launch.json`, `.gitignore` |

## Current State

- **Branch:** `main` (PR #2 merged back)
- **Phase 5.6** split view layout is live
- **All 17 commits** pushed and deployed
- Codebase is significantly cleaner after the 7-commit refactor pass
- Search is faster (Postgres-level cross-column lookup) and more resilient (auto-expand radius, HCPCS fallback)

## Open Items / Next Steps

- Insurance filter on results page — currently loaded but doesn't filter (wire it up or remove)
- Distance accuracy — provider locations geocoded from ZIP centroids (±2-5mi error). Consider "approximate" label or re-geocode from full addresses.
- The pricing plan (`pricing-plan.ts`) was implemented but verify it's wired into the result cards
- Mobile testing of split view — toggle behavior should work but worth verifying on real devices
