# Pricing correctness and saved searches implementation plan

> Execute inline with regression tests before each behavior change. Authorized by Chris after the repository review.

**Goal:** Stop synthetic encounter prices from being presented as published cash, compare like prices, and reopen the exact resolved search.

**Architecture:** Keep published prices unchanged. Add explicit encounter-estimate metadata and use the shared display-price selector throughout the comparison. Pick one payment basis and fee scope for the headline; retain other rows with their labels. Persist a validated, versioned search context alongside saved queries.

**Constraints:** Existing Next.js/TypeScript UI and DESIGN.md; no production data writes or deployment. Retain old saved searches. Do not claim that same-class episode sums cover the whole bill.

## Task 1 — Price provenance and comparable ranges

- [x] Reproduce the placeholder bypass through the actual lookup pipeline with mocked database responses.
- [x] Verify estimated insured prices are not labeled cash; compare one basis and fee scope; keep unknown scope explicit.
- [x] Update display labels, primary-row selection and shared-price grouping to preserve provenance.
- [x] Keep episode estimates separate from published headline comparisons; estimated-total sorting must not substitute a published single-line price for a missing total.
- [x] Run regression tests and full suite.

## Task 2 — Saved resolved-search context

- [x] Test versioned context validation and exact URL restoration, including code types, plan, interpretation and side/site.
- [x] Persist the context in a nullable JSONB column; retain legacy saved-search behavior using stored codes.
- [x] Wire results → save → API → reopen; test API authentication, invalid payloads and stored context.
- [x] Run regression tests and full suite.

## Task 3 — Reproducible checks and verification

- [x] Exclude nested worktrees from Vitest, ESLint and TypeScript checks.
- [x] Document pricing rules, migration order, actual feature state and independent validation work still needed.
- [x] Run formatting, lint, type-check and suite. Production build is delegated to PR CI under the repository machine-safety constraints.
- [ ] Open a draft PR with checks and migration notes; verify CI build.

## Review focus

- An estimate must not inherit a template row's published prices or clinical attributes.
- Same numeric price is not proof of a shared hospital price file.
- Unknown, hospital-only and complete prices must not share a headline range.
- Reopening a saved search must not run a fresh AI interpretation when codes were saved.
- Invalid context must be rejected rather than silently discarded.

## Progress

- Baseline: 327 tests passed on main 8e25076.
- Workspace: isolated local clone; native managed-worktree creation failed. Original checkout unchanged.

- Final local verification: 360 tests passed across 45 files; TypeScript passed; ESLint reported no errors and one existing navigation warning.
- Independent review identified fallback totals, short DRG aliases, non-string enum payloads, and inherited template metadata. All four received failing regression tests and fixes.
- Server-rendered UI assertions cover estimate labeling and complete-fee caveats. Browser screenshot capture stalled; no live authenticated flow or database migration was exercised.
