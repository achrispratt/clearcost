# TODOS

## KB Cache Invalidation for Tier-1 Scope Change

**What:** KB cache (`kb_nodes`, `kb_synonyms`) stores resolutions from the broad 1,000-code scope. When tier-1 routing goes live, old KB entries that resolved to non-tier-1 codes will bypass the tier check, routing users to the fallback when they should get estimates (or vice versa).
**Why:** Without invalidation or post-lookup filtering, the KB cache becomes a source of stale routing decisions.
**Fix options:** (a) Invalidate KB entries for non-tier-1 codes during the tier-1 launch, or (b) add a post-KB-lookup filter that checks tier status before routing.
**Effort:** S (human: ~2hr / CC: ~15min)
**Priority:** P1 (must address before or during tier-1 launch)
**Depends on:** Tier-1 episode_definitions being finalized
**Source:** Codex plan review, 2026-03-28

## CMS Hospital Compare Quality Data + NPI Mapping

**What:** Import CMS Hospital Compare quality rankings and display inline quality badges alongside price in results. Requires NPI/CCN mapping first since `providers.npi` column exists but is never populated during Trilliant import.
**Why:** Price + quality = best value comparison. Currently the Quality column shows "—" for all hospitals. Quality badges are a real differentiator vs. tools that only show price.
**Fix options:** (a) Add NPI extraction to Trilliant import pipeline (check if Oria data includes NPI), (b) Build name+address fuzzy matcher against CMS provider files, (c) Use CMS Certification Number if available in Trilliant data.
**Effort:** M (human: ~1 week / CC: ~3hr) — the NPI mapping is the hard part, not the import
**Priority:** P2 (ship after tier-1 episode estimator is live)
**Depends on:** Tier-1 episode estimator launch (quality is additive, not blocking)
**Source:** Codex eng review, 2026-03-28
