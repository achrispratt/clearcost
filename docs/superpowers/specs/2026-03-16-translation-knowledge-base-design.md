# Translation Knowledge Base — Design Spec

**Date:** 2026-03-16
**Status:** Draft
**Replaces:** `translation_cache` table, `lib/cpt/cache.ts`
**Related issues:** #37 (cache TTL — will be closed by this work)

## Problem

The guided search flow calls Claude 2-4 times per session (~$0.01-0.03, ~4-8 seconds of AI latency). Every session starts from scratch — the system asks the same clarification questions to every user who types "knee MRI," learns nothing from the interaction, and discards the entire conversation trail.

The existing `translation_cache` only caches the legacy single-shot path (`/api/search` without pre-resolved codes). The primary user path — guided search through `/api/clarify` — bypasses the cache entirely. The cache is effectively dead code for the happy path.

## Solution

A **Translation Knowledge Base (KB)** that stores complete clarification conversation trees. When a user searches a query the system has seen before, the KB serves the clarification questions and resolved codes directly from the database — zero AI calls, instant response.

Novel queries still go to Claude. The results are written back to the KB, seeding it for future users. Over time, the KB covers an increasing percentage of search traffic, reducing AI costs toward zero and making the system faster for every user.

### Design Decisions

| Decision             | Choice                                                                                    | Rationale                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| What to cache        | Complete conversation trees (questions, options, resolutions)                             | Enables zero-AI sessions for known paths                                                 |
| Synonym handling     | Claude-assisted clustering at write time                                                  | One-time cost per novel phrasing, no latency on repeat queries, no new vendor dependency |
| Node expiration      | No TTL — nodes are permanent learned knowledge                                            | Conversation paths don't expire; corrections via admin override or annual CPT refresh    |
| Event retention      | 30-day raw events, monthly roll-up kept forever                                           | Balances storage with long-term analytics value                                          |
| Correction mechanism | Admin override + annual CPT refresh cycle (now); confidence-based auto-flagging (Stage 3) | Manual precision now, automated at scale later                                           |

## Data Model

### kb_synonyms — Query clustering

Maps many phrasings to one canonical form. Checked first on every request.

| Column             | Type        | Purpose                          |
| ------------------ | ----------- | -------------------------------- |
| `query_hash`       | text (PK)   | SHA-256 of normalized query      |
| `normalized_query` | text        | Human-readable: "mri of my knee" |
| `canonical_query`  | text        | The canonical form: "knee mri"   |
| `created_at`       | timestamptz | When this synonym was learned    |

**Index:** PK on `query_hash` (hash lookup).

**Example:** `hash("mri of my knee")` → canonical `"knee mri"`. Self-referencing entry for the canonical form itself: `hash("knee mri")` → `"knee mri"`.

### kb_nodes — Conversation step memory

One row per step in a conversation tree. The `path_hash` encodes the canonical query + all answers given so far.

| Column            | Type        | Purpose                                                                         |
| ----------------- | ----------- | ------------------------------------------------------------------------------- |
| `path_hash`       | text (PK)   | SHA-256 of `canonical_query \| answer1 \| answer2 \| ...`                       |
| `canonical_query` | text        | Root query grouping: "knee mri"                                                 |
| `answer_path`     | text[]      | Ordered answers so far: `[]`, `["right"]`, `["right", "without contrast"]`      |
| `depth`           | int         | 0 = root assessment, 1 = after first answer, etc.                               |
| `node_type`       | text        | `'question'` or `'resolution'`                                                  |
| `payload`         | jsonb       | `ClarificationQuestion` object or resolved codes + pricingPlan + interpretation |
| `hit_count`       | int         | Times this step has been served                                                 |
| `version`         | int         | Incremented on admin override or CPT refresh re-evaluation                      |
| `source`          | text        | `'claude'`, `'admin'`, or `'migrated'`                                          |
| `created_at`      | timestamptz | When first created                                                              |
| `updated_at`      | timestamptz | When last served or updated                                                     |

**Indexes:**

- PK on `path_hash` (hash lookup per step).
- Index on `canonical_query` (retrieve all nodes in a tree for admin review).

**Path hash construction:** `SHA-256(canonical_query + "|" + answers.join("|"))`. Root node: `SHA-256("knee mri|")`. After first answer: `SHA-256("knee mri|right")`. Pipe delimiter chosen because it doesn't appear in natural language queries.

**Answer path segment mapping from `ClarificationTurn`:**

Each `ClarificationTurn` has `{ questionId, selectedOption, freeText }`. The path segment is derived as:

- If `selectedOption` is a label (not `"other"`): use `selectedOption.toLowerCase().trim()` as the segment.
- If `selectedOption` is `"other"` with `freeText`: **do not write to the KB**. Free-text answers are too unique to cache — the Claude response for this step is returned but not persisted. The next user who reaches the same question node will see the same options and can still get a KB hit if they pick a structured option.
- `questionId` is not included in the path hash — the path is defined by the sequence of answers, not the sequence of question IDs (which are implementation details and may change across versions).

**Root node ambiguity (high vs low confidence):**

The same canonical query can resolve to different node types at depth 0. For example, "colonoscopy" might get high confidence (resolution node) while "knee MRI" gets low confidence (question node). This is correct — different queries have different trees.

The potential issue is when the _same_ query gets different confidence levels across Claude calls (Claude is not perfectly deterministic). Resolution: **first-write-wins**. The first Claude response for a canonical query at depth 0 establishes the node type. Subsequent Claude calls for the same query (via different synonym phrasings in Scenario 2) do not overwrite. If the first write was wrong, admin override corrects it. The `version` field tracks corrections.

**Query normalization function:**

Reuse the existing `normalizeQueryForCache()` from `lib/cpt/cache.ts` (moved to `lib/kb/path-hash.ts`): `query.trim().toLowerCase().replace(/\s+/g, " ")`. This determines hash identity — `"MRI of my Knee"` and `"mri of my knee"` produce the same hash.

### kb_events — Raw interaction log (30-day TTL)

Lightweight event stream recording user behavior after KB-served results.

| Column       | Type        | Purpose                                                    |
| ------------ | ----------- | ---------------------------------------------------------- |
| `id`         | uuid (PK)   | Unique event ID                                            |
| `path_hash`  | text        | Which KB node produced the results                         |
| `event_type` | text        | `'walk'`, `'result_click'`, `'save'`, `'bounce'`, `'skip'` |
| `session_id` | text        | Anonymous session identifier (not user-linked)             |
| `created_at` | timestamptz | When the event occurred                                    |

**Index:** Index on `created_at` (TTL cleanup). Index on `path_hash` (aggregation queries).

**TTL:** pg_cron job runs daily: `DELETE FROM kb_events WHERE created_at < NOW() - INTERVAL '30 days'`.

**Event definitions:**

- `walk` — A KB node was served to a user. `path_hash` points to the **question or resolution node** that was served. Logged server-side in `/api/clarify` on every KB hit.
- `result_click` — User clicked a provider card on the results page. `path_hash` points to the **resolution node** that produced the results.
- `save` — User saved the search. `path_hash` points to the **resolution node**.
- `bounce` — User navigated away from results without clicking a provider. Best-effort detection: logged when the user navigates back within the app (via `popstate` or starting a new search). Tab close / browser exit cannot reliably fire events and is not tracked. `path_hash` points to the **resolution node**.
- `skip` — User skipped clarification (clicked "Show results anyway"). `path_hash` points to the **last question node** the user saw before skipping.

**Event path_hash rule of thumb:** `walk` and `skip` reference the node the user was on. `result_click`, `save`, and `bounce` reference the resolution node that produced the displayed results.

### kb_path_stats — Permanent monthly summaries

Aggregated from `kb_events` before raw data is deleted. One row per path per month.

| Column         | Type | Purpose                           |
| -------------- | ---- | --------------------------------- |
| `path_hash`    | text | Which KB node                     |
| `period`       | date | First of month: `2026-03-01`      |
| `walk_count`   | int  | Times this path was served        |
| `click_count`  | int  | Times users clicked a provider    |
| `save_count`   | int  | Times users saved a search        |
| `bounce_count` | int  | Times users bounced back          |
| `skip_count`   | int  | Times users skipped clarification |

**PK:** `(path_hash, period)`.

**Roll-up:** pg_cron job runs on the 1st of each month. Aggregates the prior month's `kb_events` into `kb_path_stats`, then the daily TTL job cleans up events older than 30 days.

## Lookup and Write-Back Flow

### Scenario 1: Known query, known path (KB hit)

1. Normalize incoming query, compute `query_hash`.
2. Look up `kb_synonyms` → get `canonical_query`.
3. Build `path_hash` from `canonical_query` + current `turns` (answers so far).
4. Look up `kb_nodes` by `path_hash`.
5. **HIT:** Return the node's payload directly. Bump `hit_count`. Log `walk` event.
6. Repeat steps 3-5 for each subsequent clarification answer.

**Result:** Zero Claude API calls. ~10ms per step. $0.00.

### Scenario 2: New phrasing, known tree (synonym miss, node hit)

1. Synonym lookup → **MISS** (new phrasing).
2. Call Claude (`assessQuery`) as today — this is required anyway to handle the query.
3. **Synonym clustering check (combined into the assessQuery call):** The `assessQuery` system prompt is extended with a small addition: "Here are known canonical queries: [list]. If the user's query is semantically equivalent to one, return `canonicalMatch: "knee mri"` in your response." This adds no extra API call — it's a few extra lines in the existing prompt.
4. **Match found:** Write new `kb_synonyms` entry mapping this phrasing to the matched canonical. Serve from existing KB tree from this point forward.
5. **No match:** This is actually Scenario 3 (novel query).

**Result:** 1 Claude API call (same call that would happen anyway, with synonym check piggybacked). All future identical phrasings → Scenario 1.

**Synonym candidate list:** Query `SELECT DISTINCT canonical_query FROM kb_synonyms` — cached in-memory with a short TTL (5 minutes) to avoid hitting the DB on every miss. At 5,000 unique canonical queries, this is ~50KB of strings added to the prompt. If the list grows beyond ~10,000 entries (prompt becomes unwieldy), switch to passing only the top 2,000 by hit count + any entries whose canonical_query shares a keyword with the incoming query. This is a Stage 2+ optimization — at launch the list will be small.

### Scenario 3: Completely novel query (full KB miss)

1. Synonym lookup → **MISS**.
2. Synonym clustering check → **No match** (genuinely new query).
3. Full Claude flow as today: `assessQuery()` → clarification loop via `clarifyQuery()` → resolved codes.
4. **Write-back:** After each Claude response, write the synonym entry + KB node.
   - If high confidence (no clarification needed): 1 synonym + 1 resolution node.
   - If clarification needed: 1 synonym + N question nodes + resolution node (written progressively as the user answers).

**Result:** Same cost as today (2-4 Claude calls). Seeds the KB so all future searches for this query → Scenario 1.

### Write-back detail

Nodes are written **progressively**, not all at once. Each time Claude returns a response during clarification:

1. Compute `path_hash` for the current step.
2. Write a `kb_nodes` row with the Claude response as payload.
3. The user answers, the next Claude call happens, the next node is written.

This means if a user abandons mid-clarification, the partial tree is still saved. The next user who starts the same query gets the first question instantly from the KB, even if deeper branches haven't been explored yet.

## Integration Points

### New files

| File                                                | Purpose                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `lib/kb/lookup.ts`                                  | KB read path: synonym lookup → node lookup. Returns hit/miss.                    |
| `lib/kb/write-back.ts`                              | KB write path: store synonym + node after Claude call. Synonym clustering check. |
| `lib/kb/events.ts`                                  | Event logging: write to `kb_events`.                                             |
| `lib/kb/path-hash.ts`                               | Shared utility: build `path_hash` from canonical query + ordered answers.        |
| `app/api/kb/events/route.ts`                        | API endpoint receiving client-side interaction events.                           |
| `supabase/migrations/YYYYMMDD_create_kb_tables.sql` | Creates all four tables, indexes, RLS policies, pg_cron jobs.                    |

### Modified files

| File                              | Change                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/clarify/route.ts`        | KB lookup before Claude call. Write-back on miss. Primary integration point.                                                                                                                                                                                                                                                                                               |
| `app/api/cpt/route.ts`            | Add KB lookup. On hit, return cached `TranslationResponse`. On miss, call `translateQueryToCPT()` as today, then write result to KB as a depth-0 resolution node. The payload is normalized to `TranslationResponse` shape (adding `confidence: "high"`, `conversationComplete: true`) so both paths write the same format.                                                |
| `app/api/search/route.ts`         | Pass `path_hash` + `session_id` through to response for client-side event logging. Remove old cache logic (lines 356-403). Add KB lookup to the legacy standard path (no direct codes) — same pattern as `/api/clarify`: check KB first, fall through to `translateQueryToCPT()` on miss, write back on success. This ensures the legacy path still benefits from caching. |
| `app/results/useResultsSearch.ts` | Emit `result_click`, `save`, `bounce` events to `POST /api/kb/events`.                                                                                                                                                                                                                                                                                                     |
| `types/index.ts`                  | Add KB-related types (KBNode, KBSynonym, KBEvent, etc.).                                                                                                                                                                                                                                                                                                                   |

### Deprecated

| What                                                     | Action                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `lib/cpt/cache.ts`                                       | Delete after migration. Fully replaced by `lib/kb/lookup.ts`.   |
| `translation_cache` table                                | Migrate existing rows to `kb_synonyms` + `kb_nodes`, then drop. |
| Cache logic in `app/api/search/route.ts` (lines 356-403) | Remove. KB handles caching upstream in `/api/clarify`.          |

### Migration from translation_cache

Each existing `translation_cache` row becomes:

1. A `kb_synonyms` entry: `query_hash` → `canonical_query` (self-referencing, since these were exact-match cached).
2. A `kb_nodes` entry: depth 0, `node_type: 'resolution'`, payload carries over codes + interpretation + pricingPlan. `source: 'migrated'`. `hit_count` carries over.

One-time migration script. Existing cache data is flat (query → codes, no conversation trees), so each row maps to exactly one synonym + one resolution node.

**Migration details:**

- `canonical_query` for migrated rows: use the existing `normalized_query` value. These are already lowercased/trimmed by the same normalization function. Since these were exact-match cached (no synonym clustering was done), each migrated entry is self-referencing — the normalized query IS the canonical form.
- Migrated synonym entries bypass synonym clustering (no Claude call needed — they're already 1:1 mappings).
- The migration script also drops the three existing RLS policies on `translation_cache` (`select`, `insert`, `update`) before dropping the table.

### Session ID for event tracking

The `/api/search` response includes a `kb_session_id` (random UUID generated per search request) and `kb_path_hash` (if the result came from a KB-resolved path). The client stores these and passes them back when logging events.

The session ID is:

- Generated server-side in `/api/clarify` (on the first call of a session) and carried through to `/api/search`.
- Anonymous — no link to user identity or Supabase auth.
- Short-lived — only meaningful for grouping events within one search session.

**Passing KB metadata to the results page:** The guided search flow navigates to `/results` with URL params (codes, interpretation, etc.). Two new params are added: `kbSessionId` and `kbPathHash`. The results page reads these and passes them to event logging calls. If the search didn't go through the KB (direct URL entry, bookmark), these params are absent and no events are logged.

## Growth Path: Confidence-Based Scoring (Phase B)

The system collects interaction data from day one via `kb_events` and `kb_path_stats`. Phase B — automated confidence scoring and re-evaluation — is layered on when traffic volume provides statistical significance.

### Stage 1: Seed (Launch → ~1,000 total searches, ~30-50/day)

**What's happening:** Most queries are novel (Scenario 3). KB hit rate climbs from 0% toward 40-50%. Claude API costs ~$15-30/month.

**What you're doing:**

- Monitoring KB hit rate (% of requests served from KB without AI).
- Watching for wrong resolutions via manual review.
- Using admin override to fix bad paths.

**Key metric:** KB hit rate. **Target:** 50% by end of Stage 1.

**Trigger for Stage 2:** KB hit rate stabilizes above 50% for 2+ consecutive weeks.

### Stage 2: Learn (~1,000-10,000 total searches, ~100-300/day)

**What's happening:** KB hit rate reaches 60-80%. Synonym map growing — new phrasings linking to existing trees. First monthly roll-ups produce `kb_path_stats` data. Claude API costs drop to ~$5-15/month.

**What you're doing:**

- Monthly roll-up cron is running (already built in Stage 1).
- Manual review: query `kb_path_stats` for paths with bounce_rate > 30%.
- Investigate high-bounce paths — are the codes wrong, or is the query inherently ambiguous?
- Building intuition for what "bad" looks like in your data.

**Key metric:** Bounce rate distribution across resolution nodes. **Target:** Median bounce rate < 20%.

**NOT ready for automation yet** — individual paths don't have enough walks for statistical significance.

**Trigger for Stage 3:** You have 50+ paths with ≥50 walks/month AND 6+ months of `kb_path_stats` data.

### Stage 3: Threshold — Phase B kicks in (~10,000-50,000 total searches, ~500-1,000/day)

**What's happening:** Statistical significance is achievable. A path with 200 walks and 35% bounce rate is meaningfully bad. KB hit rate: 80-90%. Claude API costs: ~$2-5/month.

**What you build:**

1. **Confidence score** per resolution node, computed from `kb_path_stats`:

```
confidence = click_rate × 0.5
           + save_rate  × 0.3
           - bounce_rate × 0.4
           + log(walk_count) × 0.1
```

(Starting formula — tune with real data.)

2. **Auto-flag rule:**
   - Resolution node has `walk_count ≥ 50` in the current month
   - AND `bounce_rate > 25%`
   - AND bounce rate trending up over 2+ consecutive months
   - → Flag for re-evaluation

3. **Re-evaluation flow:**
   - Flagged paths are queued for Claude re-assessment.
   - Claude re-runs the translation with current context.
   - New result stored as a new `version` of the node.
   - Old version preserved for comparison.
   - Admin notified of changes for review.

**Trigger for Stage 4:** Auto-flagging is catching problems before user reports. KB hit rate > 90%.

### Stage 4: Self-Healing (~50,000+ total searches, ~1,000+/day)

**What's happening:** KB serves 90%+ of queries with no AI. Annual CPT refresh is the main re-evaluation trigger. Claude API costs: negligible (<$1/month).

**Optional enhancements (build if/when needed):**

- **Automated re-evaluation:** Flagged paths auto-trigger Claude re-assessment with no human in the loop.
- **A/B testing:** Serve old vs. new resolution to a percentage of traffic, compare bounce rates to confirm improvement before full rollover.
- **Emerging query detection:** Identify new query patterns from `kb_events` before they become high-volume — proactively seed KB trees.

**Strategic value:** The KB becomes a proprietary query-to-code knowledge base. It encodes real user search behavior — what people actually ask for, how they describe it, what clarifications matter. This is the moat: a competitor can't replicate it without the same volume of real user searches.

## Storage Estimates

| Scenario                 | Unique queries | Avg tree size | Total KB storage | kb_path_stats       |
| ------------------------ | -------------- | ------------- | ---------------- | ------------------- |
| Launch (6 months)        | ~500           | ~16 KB        | ~8 MB            | ~30K rows (~1 MB)   |
| Growth (1,000s of users) | ~2,000         | ~20 KB        | ~40 MB           | ~120K rows (~5 MB)  |
| Mature                   | ~5,000         | ~25 KB        | ~125 MB          | ~300K rows (~12 MB) |
| Extreme (long tail)      | ~20,000        | ~30 KB        | ~600 MB          | ~1.2M rows (~50 MB) |

Trees grow organically (only paths users walk are stored), not combinatorially. All estimates well within Supabase Pro's 8 GB limit.

## What This Does NOT Change

- **The clarification UX** — Users still see the same questions, answer them the same way. The experience is identical, just faster.
- **The results page** — No changes to how results are displayed or filtered.
- **The `/api/search` price lookup** — Still does the same PostGIS charge lookup. KB only affects how codes are resolved, not how prices are found.
- **Auth/RLS on saved_searches** — Unrelated.

## RLS Policies

KB tables need permissive policies since anonymous (unauthenticated) users can search and their interactions seed the KB. The server Supabase client (`lib/supabase/server.ts`) may be unauthenticated for anonymous visitors.

| Table           | SELECT                   | INSERT                                      | UPDATE                                                   |
| --------------- | ------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| `kb_synonyms`   | Public (anyone can read) | Public (anonymous searches create synonyms) | Public (not expected, but safe — rows are append-mostly) |
| `kb_nodes`      | Public                   | Public                                      | Public (hit_count bumps, version updates)                |
| `kb_events`     | Public                   | Public                                      | None needed (events are write-once)                      |
| `kb_path_stats` | Public                   | Service-role only (cron job writes)         | Service-role only (cron job upserts)                     |

`kb_path_stats` is the only table restricted to service-role writes — the monthly roll-up cron runs as a Supabase database function (not an API route), so it uses the service role implicitly.

For `kb_synonyms`, `kb_nodes`, and `kb_events`: the pattern matches the existing `translation_cache` policies (permissive SELECT/INSERT/UPDATE for all). These tables contain no user-identifiable data.

- **The client-side `responseCache` useRef** — Still useful for same-session back/forward navigation within the guided search. KB handles cross-session persistence.
