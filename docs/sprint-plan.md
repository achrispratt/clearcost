# ClearCost — Sprint Plan: MVP Polish & Ship

**Created:** 2026-02-26
**Goal:** Close PRD gaps, optimize performance, polish mobile UX, and harden for public launch.
**Approach:** Ship-quality MVP. No feature creep. Every change must improve UX, latency, or reliability.

---

## Sprint Overview

The MVP pipeline works end-to-end. This sprint closes the gap between "working" and "ship-ready" by focusing on three pillars:

1. **Performance** — Add caching to eliminate redundant Claude API calls, cutting typical search latency by 40-60% for common queries
2. **UX Completeness** — Implement PRD features that were skipped: distance radius filter, billing class callouts, low-result-count nudges, loading skeletons
3. **Mobile Polish** — Optimize touch targets, compact layouts, and mobile-specific interactions

### What We're NOT Doing
- No new pages or routes
- No new API endpoints (except cache layer)
- No test framework setup (separate effort)
- No analytics/error tracking integration (separate effort)
- No SEO/programmatic pages (Phase 6+)
- No new dependencies unless essential

---

## Work Items

### 1. Query Translation Cache

**Problem:** Every search hits Claude API (~1-2s latency, ~$0.002/query). Common queries like "knee MRI" or "colonoscopy" are translated identically every time.

**Solution:** Server-side cache in Supabase for query→code translations.

**Implementation:**
- New `translation_cache` table: `query_hash (PK) | query | codes (jsonb) | interpretation | created_at | hit_count`
- Normalize queries before hashing: lowercase, trim, collapse whitespace
- Cache lookup in `translateQueryToCPT()` and `assessQuery()` — check cache before calling Claude
- Only cache "high confidence" results (not partial clarification responses)
- No TTL needed for MVP (billing codes don't change frequently)
- Log cache hit rate in response headers for monitoring

**Impact:** Common queries go from ~1.5s to ~200ms. Reduces Claude API costs proportionally.

**Files touched:**
- `lib/cpt/translate.ts` — Add cache check before Claude call, write to cache after
- `lib/cpt/cache.ts` — New file: cache read/write/hash functions
- `supabase/schema.sql` — Add translation_cache table definition
- API migration script for the new table

---

### 2. Distance Radius Filter

**Problem:** PRD specifies 25/50/100/250 mile radius filter. Currently hardcoded to 25 miles with no user control.

**Solution:** Add radius selector to FilterBar. Pass radius to search API.

**Implementation:**
- Add radius dropdown to `FilterBar` (25mi default, options: 10, 25, 50, 100, 250)
- BUT: radius filtering happens server-side in the PostGIS RPC, not client-side
- Two approaches:
  - **Option A (recommended):** Fetch with large radius (250mi), filter client-side by `distanceMiles`. Avoids re-fetching on radius change.
  - **Option B:** Re-fetch from API when radius changes. More accurate count but adds latency.
- Go with Option A: change default fetch radius to 100mi in the search API, add client-side distance filter in FilterBar
- If initial fetch returns <3 results at 100mi, auto-expand to 250mi (server-side retry)

**Files touched:**
- `components/FilterBar.tsx` — Add radius dropdown, add distance filtering to useEffect
- `app/api/search/route.ts` — Increase default radius to 100mi
- `app/results/page.tsx` — Pass initial radius to FilterBar

---

### 3. Billing Class Contextual Callouts

**Problem:** PRD specifies smart callouts about what a price covers (facility-only vs. bundled). `billingClass` data exists in results but isn't surfaced.

**Solution:** Add contextual badges/tooltips to ResultCard based on `billingClass` value.

**Implementation:**
- In `ResultCard`, below the price, add a small contextual note:
  - `billing_class === "facility"` → "Facility fee only — professional fees (e.g., radiologist) may apply separately"
  - `billing_class === "professional"` → "Professional fee only — facility charges may apply separately"
  - `billing_class === "both"` or `null` → No extra callout (likely bundled)
- Use a subtle info icon + tooltip pattern (not a full banner — avoid visual noise)
- Use CSS `--cc-accent` (amber) for the callout to draw appropriate attention
- Keep it one line on desktop, expandable on mobile

**Files touched:**
- `components/ResultCard.tsx` — Add billing class callout below price section

---

### 4. Low Result Count Handling

**Problem:** PRD says "fewer than 3 results shows a disclaimer with suggestion to expand radius." Currently no handling for sparse results.

**Solution:** Show contextual message when results are thin.

**Implementation:**
- In `ResultsList`, when `results.length > 0 && results.length < 3`:
  - Show banner: "Only {n} result(s) found within your search radius. Try expanding your search area for more options."
  - Include button to expand radius (integrates with the radius filter from item #2)
- When `results.length === 0`:
  - Current empty state is fine, but add: "No results found for this procedure near {location}. Try a larger search radius or a different location."

**Files touched:**
- `components/ResultsList.tsx` — Add low-count banner with expand action
- Coordinate with FilterBar radius state (may need to lift radius state to results page)

---

### 5. Loading Skeleton States

**Problem:** Results page shows a spinner while loading. The shimmer CSS is defined in globals.css but unused. Skeleton loading provides better perceived performance.

**Solution:** Replace spinner with skeleton cards in ResultsList.

**Implementation:**
- In `ResultsList`, when `loading === true`, render 4-6 skeleton `ResultCard` shapes using the existing `.shimmer` CSS class
- Skeleton shape: match ResultCard layout (left stripe, title bar, address bar, price block, footer)
- Remove the standalone spinner from the loading state
- Keep the spinner only for the guided search assessment phase (that's a different UX — short wait with "Understanding your query...")

**Files touched:**
- `components/ResultsList.tsx` — Replace spinner with skeleton cards

---

### 6. Mobile UX Polish

**Problem:** UI is responsive but not mobile-optimized. Touch targets, spacing, and some layouts need refinement.

**Items:**
1. **SearchBar (compact mode):** Location input is cramped on mobile. Make the stacked layout (query on top, location below) the default for screens < sm breakpoint. Ensure search button spans full width on mobile.
2. **FilterBar:** Horizontal scroll on mobile is awkward. Stack filters vertically or use a collapsible "Filters" button that reveals them.
3. **ResultCard:** Price and provider info compete for space on small screens. Stack price below provider name instead of side-by-side.
4. **ClarificationStep:** Option cards are fine at `grid-cols-1 sm:grid-cols-2`. Ensure touch targets are 44px minimum height.
5. **MapView:** 384px height is fine. Add a "View Full Map" expand option on mobile.

**Implementation approach:** Pure CSS/Tailwind changes. No new components needed.

**Files touched:**
- `components/SearchBar.tsx` — Adjust compact mode for mobile
- `components/FilterBar.tsx` — Add collapsible filter on mobile
- `components/ResultCard.tsx` — Stack layout on mobile
- `components/ClarificationStep.tsx` — Ensure 44px min touch targets

---

### 7. Code Cleanup

**Problem:** Small amount of dead code and legacy artifacts.

**Items:**
- Remove `lookupPrices` legacy function from `lib/cpt/lookup.ts`
- Remove deprecated type aliases (`PriceResult`, `NegotiatedRate`) from `types/index.ts`
- FilterBar: `selectedPayer` state is loaded but not integrated into filtering. Either wire it up (if payer-specific results are available in the data) or remove the payer dropdown.
- MapView: Module-level `optionsSet` flag is a code smell. Move to a ref or context.

**Decision needed on payer dropdown:** The charges table has `avg_negotiated_rate` but not payer-specific rates for MVP. The dropdown fetches payer names but selecting one doesn't filter results. **Recommendation:** Remove the payer dropdown for now — it promises functionality that doesn't exist yet. Add it back in Phase 7 when plan-level data is available. This avoids confusing users.

**Files touched:**
- `lib/cpt/lookup.ts` — Remove lookupPrices
- `types/index.ts` — Remove deprecated aliases
- `components/FilterBar.tsx` — Remove payer dropdown (or integrate if data supports it)
- `components/MapView.tsx` — Refactor optionsSet

---

## Priority Order

| # | Item | Impact | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Query Translation Cache | High (latency + cost) | Medium | P0 — Done (stability hardening commit) |
| 5 | Loading Skeleton States | High (perceived perf) | Low | P0 |
| 3 | Billing Class Callouts | High (trust + transparency) | Low | P0 |
| 2 | Distance Radius Filter | Medium (UX completeness) | Medium | P1 |
| 4 | Low Result Count Handling | Medium (UX polish) | Low | P1 |
| 6 | Mobile UX Polish | Medium (mobile users) | Medium | P1 |
| 7 | Code Cleanup | Low (maintainability) | Low | P2 |

**Execution order:** 7 → 1 → 5 → 3 → 4 → 2 → 6

Rationale: Start with cleanup (remove dead code before adding new code), then cache (biggest latency win), then UX items in order of visual impact.

---

## Out of Scope (Backlog)

These are valuable but not for this sprint:

- **Search suggestions/autocomplete** — Future UX enhancement
- **E2E test suite** — Needs Playwright/Cypress setup, separate sprint
- **Error tracking (Sentry)** — Infrastructure, not product
- **Analytics (PostHog)** — Should happen post-launch when there's real traffic
- **Map marker clustering** — Edge case for rural searches
- **All-in cost estimation** — Requires research into professional fee benchmarks
- **Translation cache eviction/TTL** — `translation_cache` table grows forever with no cleanup. Needs a TTL-based eviction strategy (e.g., delete entries older than 90 days, or cap table size). Low urgency with current traffic but will matter as query volume grows.
- **Rate limiting** — Not needed until traffic grows
- **Accessibility audit** — Important but separate effort
- **Programmatic SEO pages** — Phase 6+

---

## Success Criteria

- [ ] Common queries ("knee MRI", "colonoscopy") return results in <1s (cache hit)
- [ ] Results page shows skeleton cards during loading instead of spinner
- [ ] Facility-only charges show contextual callout about potential additional fees
- [ ] Users can adjust search radius from the results page
- [ ] Fewer than 3 results shows helpful guidance
- [ ] Mobile search and results are comfortable to use on a phone
- [ ] No dead code or unused UI elements that promise undelivered features
