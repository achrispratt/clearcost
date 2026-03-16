# Translation Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead translation_cache with a knowledge base that stores complete clarification conversation trees, serving repeat queries instantly with zero AI calls.

**Architecture:** Four new Supabase tables (kb_synonyms, kb_nodes, kb_events, kb_path_stats) with a new `lib/kb/` module for lookup, write-back, and event logging. The `/api/clarify` route becomes "check KB first, fall through to Claude on miss, write back on success." Client-side event tracking logs user interactions for future confidence scoring.

**Tech Stack:** Supabase Postgres, Next.js API routes, TypeScript, pg_cron (for TTL/roll-up jobs)

**No test framework exists in this project.** Verification is done via `npx tsx` script execution, type-checking with the TypeScript compiler, and manual testing with `npm run dev`. Do not attempt to use Jest, Vitest, or any test runner.

**Spec:** `docs/superpowers/specs/2026-03-16-translation-knowledge-base-design.md`

---

## File Structure

```
lib/kb/                          ← NEW: KB module
  path-hash.ts                   ← Normalization, hash construction, answer segment mapping
  lookup.ts                      ← KB read path: synonym lookup → node lookup
  write-back.ts                  ← KB write path: store synonym + node(s) after Claude call
  events.ts                      ← Event logging helpers (write to kb_events)

app/api/kb/events/route.ts       ← NEW: API endpoint for client-side event logging

supabase/migrations/
  20260316_create_kb_tables.sql   ← NEW: Schema, indexes, RLS, pg_cron jobs

scripts/migrate-translation-cache.ts ← NEW: One-time migration script

app/api/clarify/route.ts         ← MODIFY: KB lookup before Claude, write-back on miss
app/api/cpt/route.ts             ← MODIFY: KB lookup for single-shot queries
app/api/search/route.ts          ← MODIFY: KB lookup on legacy path, pass KB metadata through
app/results/useResultsSearch.ts  ← MODIFY: Emit interaction events to /api/kb/events
app/guided-search/useClarificationState.ts ← MODIFY: Pass KB metadata to results URL
types/index.ts                   ← MODIFY: Add KB types
lib/cpt/cache.ts                 ← DELETE: Replaced by lib/kb/
```

---

## Chunk 1: Foundation (types, hashing, database)

### Task 1: Add KB types to types/index.ts

**Files:**

- Modify: `types/index.ts`

- [ ] **Step 1: Add KB type definitions**

Add after the `SavedSearch` interface (around line 285):

```typescript
// -- Knowledge Base (Translation KB) --
export type KBNodeType = "question" | "resolution";
export type KBSource = "claude" | "admin" | "migrated";
export type KBEventType = "walk" | "result_click" | "save" | "bounce" | "skip";

export interface KBSynonym {
  query_hash: string;
  normalized_query: string;
  canonical_query: string;
  created_at: string;
}

export interface KBNode {
  path_hash: string;
  canonical_query: string;
  answer_path: string[];
  depth: number;
  node_type: KBNodeType;
  payload: KBQuestionPayload | KBResolutionPayload;
  hit_count: number;
  version: number;
  source: KBSource;
  created_at: string;
  updated_at: string;
}

export interface KBQuestionPayload {
  type: "question";
  question: ClarificationQuestion;
  interpretation?: string;
  codes?: CPTCode[];
  pricingPlan?: PricingPlan;
  confidence: ConfidenceLevel;
}

export interface KBResolutionPayload {
  type: "resolution";
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
  queryType?: QueryType;
  pricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
  confidence: ConfidenceLevel;
  conversationComplete: boolean;
}

export interface KBLookupResult {
  hit: boolean;
  canonical_query?: string;
  path_hash?: string;
  node?: KBNode;
}
```

Also add optional KB metadata fields to the existing `TranslationResponse` interface (around line 276):

```typescript
export interface TranslationResponse {
  // ... existing fields unchanged ...
  nextQuestion?: ClarificationQuestion;
  conversationComplete?: boolean;
  kbSessionId?: string; // ADD: KB session ID for event tracking
  kbPathHash?: string; // ADD: KB path hash for event tracking
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to KB types.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat(kb): add Knowledge Base type definitions"
```

---

### Task 2: Create path-hash utility

**Files:**

- Create: `lib/kb/path-hash.ts`

- [ ] **Step 1: Create the file**

```typescript
import { createHash } from "crypto";
import type { ClarificationTurn } from "@/types";

/**
 * Normalizes a query string for KB lookup.
 * Moved from lib/cpt/cache.ts — same logic, new home.
 */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Computes SHA-256 hash of the given input string.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Computes query_hash for kb_synonyms lookup.
 */
export function computeQueryHash(query: string): {
  normalizedQuery: string;
  queryHash: string;
} {
  const normalizedQuery = normalizeQuery(query);
  return { normalizedQuery, queryHash: sha256(normalizedQuery) };
}

/**
 * Extracts the answer segment from a ClarificationTurn.
 * Returns null for free-text ("other") answers — these are not cacheable.
 */
export function turnToSegment(turn: ClarificationTurn): string | null {
  if (turn.selectedOption === "other" && turn.freeText) {
    return null; // Free-text answers are too unique to cache
  }
  return turn.selectedOption.toLowerCase().trim();
}

/**
 * Builds the path_hash for a KB node lookup.
 *
 * path_hash = SHA-256(canonical_query + "|" + answers.join("|"))
 *
 * Root node (no answers): SHA-256("knee mri|")
 * After first answer:     SHA-256("knee mri|right")
 * After second:           SHA-256("knee mri|right|without contrast")
 *
 * Returns null if any turn contains a free-text answer (not cacheable).
 */
export function buildPathHash(
  canonicalQuery: string,
  turns: ClarificationTurn[]
): string | null {
  const segments: string[] = [];
  for (const turn of turns) {
    const segment = turnToSegment(turn);
    if (segment === null) return null; // Free-text in path — not cacheable
    segments.push(segment);
  }
  const pathString = canonicalQuery + "|" + segments.join("|");
  return sha256(pathString);
}

/**
 * Builds path_hash from pre-computed answer segments (for write-back).
 */
export function buildPathHashFromSegments(
  canonicalQuery: string,
  answerSegments: string[]
): string {
  const pathString = canonicalQuery + "|" + answerSegments.join("|");
  return sha256(pathString);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add lib/kb/path-hash.ts
git commit -m "feat(kb): add path-hash utility for query normalization and hash construction"
```

---

### Task 3: Create database migration

**Files:**

- Create: `supabase/migrations/20260316_create_kb_tables.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================================
-- TRANSLATION KNOWLEDGE BASE
-- Replaces translation_cache with a conversation tree knowledge base.
-- See docs/superpowers/specs/2026-03-16-translation-knowledge-base-design.md
-- ============================================================================

-- kb_synonyms: Maps many query phrasings to one canonical form
create table if not exists kb_synonyms (
  query_hash text primary key,
  normalized_query text not null,
  canonical_query text not null,
  created_at timestamptz default now()
);

create index if not exists idx_kb_synonyms_canonical
  on kb_synonyms (canonical_query);

-- kb_nodes: One row per conversation step in a clarification tree
create table if not exists kb_nodes (
  path_hash text primary key,
  canonical_query text not null,
  answer_path text[] not null default '{}',
  depth integer not null default 0,
  node_type text not null check (node_type in ('question', 'resolution')),
  payload jsonb not null,
  hit_count integer not null default 0,
  version integer not null default 1,
  source text not null default 'claude' check (source in ('claude', 'admin', 'migrated')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_kb_nodes_canonical
  on kb_nodes (canonical_query);

-- kb_events: Raw interaction log (30-day TTL via pg_cron)
create table if not exists kb_events (
  id uuid primary key default gen_random_uuid(),
  path_hash text not null,
  event_type text not null check (event_type in ('walk', 'result_click', 'save', 'bounce', 'skip')),
  session_id text not null,
  created_at timestamptz default now()
);

create index if not exists idx_kb_events_created_at
  on kb_events (created_at);
create index if not exists idx_kb_events_path_hash
  on kb_events (path_hash);

-- kb_path_stats: Monthly aggregated summaries (kept forever)
create table if not exists kb_path_stats (
  path_hash text not null,
  period date not null,
  walk_count integer not null default 0,
  click_count integer not null default 0,
  save_count integer not null default 0,
  bounce_count integer not null default 0,
  skip_count integer not null default 0,
  primary key (path_hash, period)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

alter table kb_synonyms enable row level security;
alter table kb_nodes enable row level security;
alter table kb_events enable row level security;
alter table kb_path_stats enable row level security;

-- kb_synonyms: public read/write (anonymous users seed the KB)
create policy "Anyone can view kb_synonyms" on kb_synonyms for select using (true);
create policy "Anyone can insert kb_synonyms" on kb_synonyms for insert with check (true);
create policy "Anyone can update kb_synonyms" on kb_synonyms for update using (true) with check (true);

-- kb_nodes: public read/write (hit_count bumps, anonymous seeding)
create policy "Anyone can view kb_nodes" on kb_nodes for select using (true);
create policy "Anyone can insert kb_nodes" on kb_nodes for insert with check (true);
create policy "Anyone can update kb_nodes" on kb_nodes for update using (true) with check (true);

-- kb_events: public read/insert (write-once events)
create policy "Anyone can view kb_events" on kb_events for select using (true);
create policy "Anyone can insert kb_events" on kb_events for insert with check (true);

-- kb_path_stats: public read, no client writes (cron job uses service role)
create policy "Anyone can view kb_path_stats" on kb_path_stats for select using (true);

-- ============================================================================
-- pg_cron JOBS (require pg_cron extension enabled in Supabase dashboard)
-- ============================================================================

-- Daily: delete kb_events older than 30 days
-- select cron.schedule('kb-events-ttl', '0 3 * * *', $$DELETE FROM kb_events WHERE created_at < NOW() - INTERVAL '30 days'$$);

-- Monthly: roll up prior month's events into kb_path_stats
-- select cron.schedule('kb-monthly-rollup', '0 4 1 * *', $$
--   INSERT INTO kb_path_stats (path_hash, period, walk_count, click_count, save_count, bounce_count, skip_count)
--   SELECT
--     path_hash,
--     date_trunc('month', created_at)::date AS period,
--     COUNT(*) FILTER (WHERE event_type = 'walk') AS walk_count,
--     COUNT(*) FILTER (WHERE event_type = 'result_click') AS click_count,
--     COUNT(*) FILTER (WHERE event_type = 'save') AS save_count,
--     COUNT(*) FILTER (WHERE event_type = 'bounce') AS bounce_count,
--     COUNT(*) FILTER (WHERE event_type = 'skip') AS skip_count
--   FROM kb_events
--   WHERE created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
--     AND created_at < date_trunc('month', NOW())
--   GROUP BY path_hash, date_trunc('month', created_at)::date
--   ON CONFLICT (path_hash, period)
--   DO UPDATE SET
--     walk_count = kb_path_stats.walk_count + EXCLUDED.walk_count,
--     click_count = kb_path_stats.click_count + EXCLUDED.click_count,
--     save_count = kb_path_stats.save_count + EXCLUDED.save_count,
--     bounce_count = kb_path_stats.bounce_count + EXCLUDED.bounce_count,
--     skip_count = kb_path_stats.skip_count + EXCLUDED.skip_count;
-- $$);

-- NOTE: pg_cron jobs are commented out because they must be run via Supabase
-- SQL Editor after enabling the pg_cron extension. Copy and uncomment to activate.
```

- [ ] **Step 2: Apply the migration to Supabase**

Run: `npx supabase db push` or apply via Supabase SQL Editor.

Verify tables exist:

```bash
npx supabase db execute --sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'kb_%' ORDER BY table_name;"
```

Expected output: `kb_events`, `kb_nodes`, `kb_path_stats`, `kb_synonyms`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260316_create_kb_tables.sql
git commit -m "feat(kb): add database migration for KB tables, indexes, and RLS policies"
```

---

### Task 4: Update schema.sql reference

**Files:**

- Modify: `supabase/schema.sql`

- [ ] **Step 1: Add KB tables to schema.sql**

Add the four KB table definitions after the `translation_cache` section (around line 238). Copy the `CREATE TABLE` and `CREATE INDEX` statements from the migration file. Keep the `translation_cache` section in place with a comment: `-- DEPRECATED: replaced by kb_synonyms + kb_nodes. Kept for reference until migration is confirmed.`

- [ ] **Step 2: Add RLS policies for KB tables**

Add the RLS policies from the migration file after the existing translation_cache policies (around line 642).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(kb): add KB table definitions to schema.sql reference"
```

---

## Chunk 2: KB Read and Write Module

### Task 5: Create KB lookup module

**Files:**

- Create: `lib/kb/lookup.ts`

- [ ] **Step 1: Create the file**

```typescript
import { createClient } from "@/lib/supabase/server";
import { computeQueryHash, buildPathHash } from "./path-hash";
import type {
  ClarificationTurn,
  KBLookupResult,
  KBNode,
  KBQuestionPayload,
  KBResolutionPayload,
} from "@/types";

function isValidPayload(
  payload: unknown
): payload is KBQuestionPayload | KBResolutionPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.type === "question" || p.type === "resolution";
}

/**
 * Look up a query + turns in the KB.
 *
 * 1. Hash the query → look up kb_synonyms for canonical form.
 * 2. Build path_hash from canonical + turns → look up kb_nodes.
 * 3. If hit, bump hit_count and return the node.
 */
export async function kbLookup(
  query: string,
  turns: ClarificationTurn[]
): Promise<KBLookupResult> {
  const { queryHash } = computeQueryHash(query);
  const supabase = await createClient();

  // Step 1: synonym lookup
  const { data: synonym, error: synError } = await supabase
    .from("kb_synonyms")
    .select("canonical_query")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (synError || !synonym) {
    return { hit: false };
  }

  const canonicalQuery = synonym.canonical_query;

  // Step 2: build path_hash from canonical + turns
  const pathHash = buildPathHash(canonicalQuery, turns);
  if (!pathHash) {
    // Free-text answer in the path — not cacheable
    return { hit: false, canonical_query: canonicalQuery };
  }

  // Step 3: node lookup
  const { data: node, error: nodeError } = await supabase
    .from("kb_nodes")
    .select("*")
    .eq("path_hash", pathHash)
    .maybeSingle();

  if (nodeError || !node || !isValidPayload(node.payload)) {
    return { hit: false, canonical_query: canonicalQuery, path_hash: pathHash };
  }

  // Bump hit_count (fire-and-forget — don't block the response)
  supabase
    .from("kb_nodes")
    .update({
      hit_count: (node.hit_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("path_hash", pathHash)
    .then(({ error }) => {
      if (error) console.error("KB hit_count update failed:", error);
    });

  return {
    hit: true,
    canonical_query: canonicalQuery,
    path_hash: pathHash,
    node: node as KBNode,
  };
}

/**
 * Synonym-only lookup. Returns canonical_query if the query has been seen before.
 * Used by write-back to check if a novel query maps to an existing tree.
 */
export async function kbSynonymLookup(query: string): Promise<string | null> {
  const { queryHash } = computeQueryHash(query);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("kb_synonyms")
    .select("canonical_query")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error || !data) return null;
  return data.canonical_query;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add lib/kb/lookup.ts
git commit -m "feat(kb): add KB lookup module (synonym + node lookup)"
```

---

### Task 6: Create KB write-back module

**Files:**

- Create: `lib/kb/write-back.ts`

- [ ] **Step 1: Create the file**

```typescript
import { createClient } from "@/lib/supabase/server";
import {
  computeQueryHash,
  normalizeQuery,
  buildPathHashFromSegments,
  turnToSegment,
} from "./path-hash";
import type {
  ClarificationTurn,
  KBQuestionPayload,
  KBResolutionPayload,
  KBSource,
  TranslationResponse,
} from "@/types";

/**
 * Write a synonym entry to kb_synonyms.
 * Uses upsert to avoid conflicts if the same query_hash already exists.
 */
export async function writeSynonym(
  query: string,
  canonicalQuery: string
): Promise<void> {
  const { normalizedQuery, queryHash } = computeQueryHash(query);
  const supabase = await createClient();

  const { error } = await supabase.from("kb_synonyms").upsert(
    {
      query_hash: queryHash,
      normalized_query: normalizedQuery,
      canonical_query: canonicalQuery,
    },
    { onConflict: "query_hash" }
  );

  if (error) {
    console.error("KB synonym write failed:", error);
  }
}

/**
 * Write a KB node (question or resolution) to kb_nodes.
 * Uses INSERT with ON CONFLICT DO NOTHING (first-write-wins).
 */
export async function writeNode(params: {
  canonicalQuery: string;
  answerSegments: string[];
  depth: number;
  nodeType: "question" | "resolution";
  payload: KBQuestionPayload | KBResolutionPayload;
  source?: KBSource;
}): Promise<string> {
  const {
    canonicalQuery,
    answerSegments,
    depth,
    nodeType,
    payload,
    source = "claude",
  } = params;

  const pathHash = buildPathHashFromSegments(canonicalQuery, answerSegments);
  const supabase = await createClient();

  const { error } = await supabase.from("kb_nodes").upsert(
    {
      path_hash: pathHash,
      canonical_query: canonicalQuery,
      answer_path: answerSegments,
      depth,
      node_type: nodeType,
      payload,
      hit_count: 0,
      version: 1,
      source,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "path_hash",
      ignoreDuplicates: true, // first-write-wins
    }
  );

  if (error) {
    console.error("KB node write failed:", error);
  }

  return pathHash;
}

/**
 * Build the answer segments array from ClarificationTurns.
 * Returns null if any turn has a free-text answer (not cacheable).
 */
export function turnsToSegments(turns: ClarificationTurn[]): string[] | null {
  const segments: string[] = [];
  for (const turn of turns) {
    const segment = turnToSegment(turn);
    if (segment === null) return null;
    segments.push(segment);
  }
  return segments;
}

/**
 * Write back a Claude response to the KB after a miss.
 *
 * Called after assessQuery() or clarifyQuery() returns.
 * Writes the synonym (if new) and the node for this step.
 */
export async function writeBackClarifyResponse(params: {
  originalQuery: string;
  canonicalQuery: string;
  turns: ClarificationTurn[];
  response: TranslationResponse;
}): Promise<string | null> {
  const { originalQuery, canonicalQuery, turns, response } = params;

  // Write synonym (original query → canonical)
  await writeSynonym(originalQuery, canonicalQuery);

  // Build answer segments from turns
  const segments = turnsToSegments(turns);
  if (segments === null) return null; // Free-text in path — skip KB write

  // Determine payload type
  const isResolution =
    response.confidence === "high" || response.conversationComplete;

  const payload: KBQuestionPayload | KBResolutionPayload = isResolution
    ? {
        type: "resolution",
        codes: response.codes,
        interpretation: response.interpretation,
        searchTerms: response.searchTerms,
        queryType: response.queryType,
        pricingPlan: response.pricingPlan,
        laterality: response.laterality,
        bodySite: response.bodySite,
        confidence: response.confidence,
        conversationComplete: true,
      }
    : {
        type: "question",
        question: response.nextQuestion!,
        interpretation: response.interpretation,
        codes: response.codes.length > 0 ? response.codes : undefined,
        pricingPlan: response.pricingPlan,
        confidence: response.confidence,
      };

  const nodeType = isResolution ? "resolution" : "question";

  const pathHash = await writeNode({
    canonicalQuery,
    answerSegments: segments,
    depth: turns.length,
    nodeType,
    payload,
  });

  return pathHash;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add lib/kb/write-back.ts
git commit -m "feat(kb): add KB write-back module (synonym + node writes)"
```

---

### Task 7: Create KB events module and API route

**Files:**

- Create: `lib/kb/events.ts`
- Create: `app/api/kb/events/route.ts`

- [ ] **Step 1: Create lib/kb/events.ts**

```typescript
import { createClient } from "@/lib/supabase/server";
import type { KBEventType } from "@/types";

/**
 * Log a KB event (server-side).
 * Used for 'walk' events logged directly in /api/clarify.
 */
export async function logKBEvent(params: {
  pathHash: string;
  eventType: KBEventType;
  sessionId: string;
}): Promise<void> {
  const { pathHash, eventType, sessionId } = params;
  const supabase = await createClient();

  const { error } = await supabase.from("kb_events").insert({
    path_hash: pathHash,
    event_type: eventType,
    session_id: sessionId,
  });

  if (error) {
    console.error("KB event log failed:", error);
  }
}
```

- [ ] **Step 2: Create app/api/kb/events/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { logKBEvent } from "@/lib/kb/events";
import type { KBEventType } from "@/types";

const VALID_EVENT_TYPES: KBEventType[] = [
  "walk",
  "result_click",
  "save",
  "bounce",
  "skip",
];

/**
 * POST /api/kb/events
 *
 * Receives client-side interaction events (result_click, save, bounce, skip).
 * Body: { pathHash: string, eventType: KBEventType, sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { pathHash, eventType, sessionId } = await request.json();

    if (
      typeof pathHash !== "string" ||
      typeof sessionId !== "string" ||
      !VALID_EVENT_TYPES.includes(eventType)
    ) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    await logKBEvent({ pathHash, eventType, sessionId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify both compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add lib/kb/events.ts app/api/kb/events/route.ts
git commit -m "feat(kb): add event logging module and POST /api/kb/events endpoint"
```

---

## Chunk 3: Route Integration

### Task 8: Integrate KB into /api/clarify

This is the primary integration point. The route changes from "always call Claude" to "check KB first, fall through to Claude on miss, write back on success."

**Files:**

- Modify: `app/api/clarify/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `app/api/clarify/route.ts` with:

```typescript
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  assessQuery,
  clarifyQuery,
  translateQueryToCPT,
} from "@/lib/cpt/translate";
import { kbLookup } from "@/lib/kb/lookup";
import { writeBackClarifyResponse } from "@/lib/kb/write-back";
import { logKBEvent } from "@/lib/kb/events";
import { normalizeQuery } from "@/lib/kb/path-hash";
import type {
  ClarificationTurn,
  KBQuestionPayload,
  KBResolutionPayload,
  TranslationResponse,
} from "@/types";

/**
 * Reconstruct a TranslationResponse from a KB node payload.
 */
function nodeToResponse(
  payload: KBQuestionPayload | KBResolutionPayload
): TranslationResponse {
  if (payload.type === "resolution") {
    return {
      codes: payload.codes,
      interpretation: payload.interpretation,
      searchTerms: payload.searchTerms,
      queryType: payload.queryType,
      pricingPlan: payload.pricingPlan,
      laterality: payload.laterality,
      bodySite: payload.bodySite,
      confidence: payload.confidence,
      conversationComplete: true,
    };
  }
  return {
    codes: payload.codes || [],
    interpretation: payload.interpretation || "",
    pricingPlan: payload.pricingPlan,
    confidence: payload.confidence,
    nextQuestion: payload.question,
    conversationComplete: false,
  };
}

/**
 * POST /api/clarify
 *
 * Multi-turn clarification endpoint for guided search.
 * Now with KB lookup: serves known paths instantly, falls through to Claude on miss.
 *
 * Body:
 *   - query: string
 *   - turns: ClarificationTurn[]
 *   - kbSessionId?: string (reuse across turns in the same search session)
 *
 * Returns: TranslationResponse + { kbSessionId, kbPathHash }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      query,
      turns = [],
      kbSessionId,
    } = body as {
      query: string;
      turns?: ClarificationTurn[];
      kbSessionId?: string;
    };
    const queryText = typeof query === "string" ? query : "";

    if (!queryText) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const sessionId = kbSessionId || randomUUID();

    // --- KB LOOKUP ---
    const kbResult = await kbLookup(queryText, turns);

    if (kbResult.hit && kbResult.node) {
      // KB HIT — serve directly, log walk event
      if (kbResult.path_hash) {
        logKBEvent({
          pathHash: kbResult.path_hash,
          eventType: "walk",
          sessionId,
        });
      }

      const response = nodeToResponse(
        kbResult.node.payload as KBQuestionPayload | KBResolutionPayload
      );

      return NextResponse.json({
        ...response,
        kbSessionId: sessionId,
        kbPathHash: kbResult.path_hash,
      });
    }

    // --- KB MISS — fall through to Claude ---
    try {
      const result =
        turns.length === 0
          ? await assessQuery(queryText)
          : await clarifyQuery(queryText, turns);

      // Determine canonical query for write-back
      const canonicalQuery =
        kbResult.canonical_query || normalizeQuery(queryText);

      // Write back to KB (fire-and-forget)
      writeBackClarifyResponse({
        originalQuery: queryText,
        canonicalQuery,
        turns,
        response: result,
      }).catch((err) => console.error("KB write-back failed:", err));

      return NextResponse.json({
        ...result,
        kbSessionId: sessionId,
        kbPathHash: kbResult.path_hash || null,
      });
    } catch (parseError) {
      console.error(
        "Guided search error, falling back to single-shot:",
        parseError
      );
      const fallback = await translateQueryToCPT(queryText);
      return NextResponse.json({
        ...fallback,
        confidence: "high" as const,
        conversationComplete: true,
        kbSessionId: sessionId,
      });
    }
  } catch (error) {
    console.error("Clarify API error:", error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Smoke test with dev server**

Run `npm run dev`, navigate to the app, perform a search that triggers guided search. Verify:

1. First search: Claude is called (check server logs), KB nodes are written.
2. Same search again: KB serves instantly (no Claude call in logs).

- [ ] **Step 4: Commit**

```bash
git add app/api/clarify/route.ts
git commit -m "feat(kb): integrate KB lookup into /api/clarify (primary integration)"
```

---

### Task 9: Integrate KB into /api/cpt

**Files:**

- Modify: `app/api/cpt/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `app/api/cpt/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { kbLookup } from "@/lib/kb/lookup";
import { writeSynonym, writeNode } from "@/lib/kb/write-back";
import { normalizeQuery } from "@/lib/kb/path-hash";
import type { KBResolutionPayload } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // KB lookup (depth 0, no turns)
    const kbResult = await kbLookup(query, []);

    if (kbResult.hit && kbResult.node) {
      const payload = kbResult.node.payload as KBResolutionPayload;
      if (payload.type === "resolution") {
        return NextResponse.json({
          codes: payload.codes,
          interpretation: payload.interpretation,
          searchTerms: payload.searchTerms,
          queryType: payload.queryType,
          pricingPlan: payload.pricingPlan,
          laterality: payload.laterality,
          bodySite: payload.bodySite,
        });
      }
    }

    // KB miss — call Claude
    const result = await translateQueryToCPT(query);

    // Write back to KB as depth-0 resolution node
    const canonicalQuery = kbResult.canonical_query || normalizeQuery(query);
    writeSynonym(query, canonicalQuery).catch((err) =>
      console.error("KB synonym write failed:", err)
    );
    writeNode({
      canonicalQuery,
      answerSegments: [],
      depth: 0,
      nodeType: "resolution",
      payload: {
        type: "resolution",
        codes: result.codes,
        interpretation: result.interpretation,
        searchTerms: result.searchTerms,
        queryType: result.queryType,
        pricingPlan: result.pricingPlan,
        laterality: result.laterality,
        bodySite: result.bodySite,
        confidence: "high",
        conversationComplete: true,
      },
    }).catch((err) => console.error("KB node write failed:", err));

    return NextResponse.json(result);
  } catch (error) {
    console.error("CPT translation error:", error);
    return NextResponse.json(
      { error: "Failed to translate query" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add app/api/cpt/route.ts
git commit -m "feat(kb): integrate KB lookup into /api/cpt (single-shot path)"
```

---

### Task 10: Integrate KB into /api/search and remove old cache

**Files:**

- Modify: `app/api/search/route.ts`

- [ ] **Step 1: Replace cache imports with KB imports**

In `app/api/search/route.ts`, replace the cache imports (lines 13-17):

```typescript
// OLD:
import {
  getCachedTranslation,
  getTranslationCacheKey,
  setCachedTranslation,
} from "@/lib/cpt/cache";

// NEW:
import { kbLookup } from "@/lib/kb/lookup";
import { writeSynonym, writeNode } from "@/lib/kb/write-back";
import { normalizeQuery, computeQueryHash } from "@/lib/kb/path-hash";
import type { KBResolutionPayload } from "@/types";
```

- [ ] **Step 2: Replace ONLY the cache lookup block (lines 356-361)**

Replace these specific lines:

```typescript
// OLD (lines 356-361):
const cacheLookup = await getCachedTranslation(queryText);
const cacheStatus: CacheStatus = cacheLookup.hit ? "hit" : "miss";
const translated =
  cacheLookup.hit && cacheLookup.payload
    ? cacheLookup.payload
    : await translateQueryToCPT(queryText);

// NEW:
const kbResult = await kbLookup(queryText, []);
const { queryHash } = computeQueryHash(queryText);
const cacheStatus: CacheStatus = kbResult.hit ? "hit" : "miss";

let translated;
if (kbResult.hit && kbResult.node) {
  const payload = kbResult.node.payload as KBResolutionPayload;
  if (payload.type === "resolution") {
    translated = {
      codes: payload.codes,
      interpretation: payload.interpretation,
      searchTerms: payload.searchTerms,
      queryType: payload.queryType,
      pricingPlan: payload.pricingPlan,
      laterality: payload.laterality,
      bodySite: payload.bodySite,
    };
  }
}
if (!translated) {
  translated = await translateQueryToCPT(queryText);
}
```

**IMPORTANT:** Leave lines 363-391 untouched (pricingPlan build, hasSearchablePlan check, lookupWithAutoExpand call). Only replace the cache lookup, not the surrounding business logic.

- [ ] **Step 3: Replace ONLY the cache write-back block (lines 393-403)**

Replace these specific lines:

```typescript
if (!kbResult.hit && results.length > 0) {
  const canonicalQuery = kbResult.canonical_query || normalizeQuery(queryText);
  writeSynonym(queryText, canonicalQuery).catch((err) =>
    console.error("KB synonym write failed:", err)
  );
  writeNode({
    canonicalQuery,
    answerSegments: [],
    depth: 0,
    nodeType: "resolution",
    payload: {
      type: "resolution",
      codes: translated.codes,
      interpretation: translated.interpretation,
      searchTerms: translated.searchTerms,
      queryType: translated.queryType,
      pricingPlan: translated.pricingPlan,
      laterality: translated.laterality,
      bodySite: translated.bodySite,
      confidence: "high",
      conversationComplete: true,
    },
  }).catch((err) => console.error("KB node write failed:", err));
}
```

- [ ] **Step 4: Update ALL remaining old cache references**

The `maybeLogSearchDiagnostics` call references `cacheLookup.queryHash`. Update to use the new `queryHash` variable (already computed above).

Also update the fast-path diagnostics blocks (around lines 279-287 and 328-337) that reference `getTranslationCacheKey`:

```typescript
// OLD:
queryHash: queryText ? getTranslationCacheKey(queryText).queryHash : undefined,

// NEW:
queryHash: queryText ? computeQueryHash(queryText).queryHash : undefined,
```

There are two occurrences in the fast-path `maybeLogSearchDiagnostics` calls. Both must be updated in this step — otherwise the code won't compile after the old cache imports are removed.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(kb): replace translation_cache with KB in /api/search"
```

---

## Chunk 4: Client-Side Event Tracking and Metadata Passing

### Task 11: Pass KB metadata through guided search to results

**Files:**

- Modify: `app/guided-search/useClarificationState.ts`

- [ ] **Step 1: Store KB session and path hash from /api/clarify responses**

Add a ref (not state) for KB metadata — refs are synchronous and available immediately, unlike `useState` which is async and would be stale when `handleResponse` calls `goToResults` in the same render cycle:

```typescript
const kbMeta = useRef<{ sessionId: string | null; pathHash: string | null }>({
  sessionId: null,
  pathHash: null,
});
```

In the `fetchOrCacheQuestion` function, after `const data: TranslationResponse = await response.json();`, extract KB metadata **before** calling `handleResponse`:

```typescript
if (data.kbSessionId) kbMeta.current.sessionId = data.kbSessionId;
if (data.kbPathHash) kbMeta.current.pathHash = data.kbPathHash;
responseCache.current.set(cacheKey, data);
handleResponse(data);
```

- [ ] **Step 2: Include kbSessionId in the /api/clarify request body**

In `fetchOrCacheQuestion`, update the fetch body to pass the session ID back so it persists across turns:

```typescript
body: JSON.stringify({
  query,
  turns: turnsArray,
  kbSessionId: kbMeta.current.sessionId,
}),
```

- [ ] **Step 3: Include KB metadata in ALL navigation paths to results**

The `goToResults` function reads from the ref:

```typescript
if (kbMeta.current.sessionId)
  extraParams.kbSessionId = kbMeta.current.sessionId;
if (kbMeta.current.pathHash) extraParams.kbPathHash = kbMeta.current.pathHash;
```

Also add the same lines to the other navigation paths that bypass `goToResults`:

- `handleResponse` line 122: `navigateToResults(buildResultsParams(extra))` — add KB params to `extra`
- `handleResponse` line 133: `navigateToResults(buildResultsParams())` — pass KB params
- `handleSkip` line 231: `navigateToResults(buildResultsParams(extra))` — add KB params to `extra`

Each of these paths should include:

```typescript
if (kbMeta.current.sessionId) extra.kbSessionId = kbMeta.current.sessionId;
if (kbMeta.current.pathHash) extra.kbPathHash = kbMeta.current.pathHash;
```

- [ ] **Step 4: Log `skip` event in handleSkip**

In the `handleSkip` function, add a `skip` event log before navigating:

```typescript
const handleSkip = () => {
  // Log skip event to KB
  if (kbMeta.current.pathHash && kbMeta.current.sessionId) {
    fetch("/api/kb/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathHash: kbMeta.current.pathHash,
        eventType: "skip",
        sessionId: kbMeta.current.sessionId,
      }),
    }).catch(() => {}); // Best-effort
  }
  // ... existing skip logic
};
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add app/guided-search/useClarificationState.ts
git commit -m "feat(kb): pass KB session/path metadata through to results page"
```

---

### Task 12: Add client-side event logging to results page

**Files:**

- Modify: `app/results/useResultsSearch.ts`

- [ ] **Step 1: Read KB params from URL and set up event logging**

Add after the existing `useSearchParams()` reads (around line 50-70):

```typescript
const kbSessionId = searchParams.get("kbSessionId");
const kbPathHash = searchParams.get("kbPathHash");

const logKBEvent = useCallback(
  (eventType: string) => {
    if (!kbPathHash || !kbSessionId) return;
    fetch("/api/kb/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathHash: kbPathHash,
        eventType,
        sessionId: kbSessionId,
      }),
    }).catch(() => {}); // Best-effort, don't block UI
  },
  [kbPathHash, kbSessionId]
);
```

- [ ] **Step 2: Expose event logging from the hook**

In the return value of the hook, expose event logging so components can call it:

```typescript
const logResultClick = useCallback(() => {
  hasInteracted.current = true;
  logKBEvent("result_click");
}, [logKBEvent]);

const logSaveSearch = useCallback(() => {
  hasInteracted.current = true;
  logKBEvent("save");
}, [logKBEvent]);

return {
  // ... existing returns
  logResultClick,
  logSaveSearch,
};
```

Consumers: `ResultCard` onClick → call `logResultClick()`. Save search handler → call `logSaveSearch()`.

- [ ] **Step 3: Log bounce events on navigation away**

Add a `useEffect` that logs a bounce if the user navigates away without interacting:

```typescript
const hasInteracted = useRef(false);

// Mark as interacted when user clicks a result
const logResultClick = useCallback(() => {
  hasInteracted.current = true;
  logKBEvent("result_click");
}, [logKBEvent]);

// Log bounce on unmount if no interaction
useEffect(() => {
  return () => {
    if (!hasInteracted.current && kbPathHash && kbSessionId) {
      // Use Blob with application/json so the API route can parse it
      navigator.sendBeacon(
        "/api/kb/events",
        new Blob(
          [
            JSON.stringify({
              pathHash: kbPathHash,
              eventType: "bounce",
              sessionId: kbSessionId,
            }),
          ],
          { type: "application/json" }
        )
      );
    }
  };
}, [kbPathHash, kbSessionId]);
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add app/results/useResultsSearch.ts
git commit -m "feat(kb): add client-side event logging (result_click, bounce) to results page"
```

---

## Chunk 5: Migration and Cleanup

### Task 13: Create translation_cache migration script

**Files:**

- Create: `scripts/migrate-translation-cache.ts`

- [ ] **Step 1: Create the migration script**

```typescript
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch all translation_cache entries
  const { data: rows, error } = await supabase
    .from("translation_cache")
    .select("query_hash, normalized_query, payload, hit_count");

  if (error) {
    console.error("Failed to fetch translation_cache:", error);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No rows in translation_cache to migrate.");
    return;
  }

  console.log(`Migrating ${rows.length} translation_cache entries...`);

  let synonymsWritten = 0;
  let nodesWritten = 0;
  let skipped = 0;

  for (const row of rows) {
    const canonicalQuery = row.normalized_query;
    const queryHash = row.query_hash;
    const payload = row.payload;

    if (!payload || !Array.isArray(payload.codes)) {
      skipped++;
      continue;
    }

    // Write synonym (self-referencing — canonical maps to itself)
    const { error: synError } = await supabase.from("kb_synonyms").upsert(
      {
        query_hash: queryHash,
        normalized_query: canonicalQuery,
        canonical_query: canonicalQuery,
      },
      { onConflict: "query_hash" }
    );

    if (synError) {
      console.error(`Synonym write failed for ${canonicalQuery}:`, synError);
      continue;
    }
    synonymsWritten++;

    // Write resolution node at depth 0
    const pathHash = sha256(canonicalQuery + "|");
    const { error: nodeError } = await supabase.from("kb_nodes").upsert(
      {
        path_hash: pathHash,
        canonical_query: canonicalQuery,
        answer_path: [],
        depth: 0,
        node_type: "resolution",
        payload: {
          type: "resolution",
          codes: payload.codes,
          interpretation: payload.interpretation || "",
          searchTerms: payload.searchTerms,
          queryType: payload.queryType,
          pricingPlan: payload.pricingPlan,
          laterality: payload.laterality,
          bodySite: payload.bodySite,
          confidence: "high",
          conversationComplete: true,
        },
        hit_count: row.hit_count || 0,
        version: 1,
        source: "migrated",
      },
      { onConflict: "path_hash", ignoreDuplicates: true }
    );

    if (nodeError) {
      console.error(`Node write failed for ${canonicalQuery}:`, nodeError);
      continue;
    }
    nodesWritten++;
  }

  console.log(`Migration complete:`);
  console.log(`  Synonyms written: ${synonymsWritten}`);
  console.log(`  Nodes written: ${nodesWritten}`);
  console.log(`  Skipped (invalid payload): ${skipped}`);
  console.log(
    `\nNext steps: verify data in kb_synonyms/kb_nodes, then drop translation_cache.`
  );
}

main();
```

- [ ] **Step 2: Run the migration**

```bash
npx tsx --env-file=.env.local scripts/migrate-translation-cache.ts
```

Expected: Counts of synonyms and nodes written matching translation_cache row count.

- [ ] **Step 3: Verify migrated data**

Check row counts via Supabase SQL Editor or CLI:

```sql
SELECT 'kb_synonyms' AS tbl, COUNT(*) FROM kb_synonyms
UNION ALL
SELECT 'kb_nodes', COUNT(*) FROM kb_nodes;
```

Expected: both counts should match the number of rows migrated (printed by the script in Step 2).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-translation-cache.ts
git commit -m "feat(kb): add translation_cache migration script"
```

---

### Task 14: Delete old cache module and clean up imports

**Files:**

- Delete: `lib/cpt/cache.ts`
- Modify: `app/api/search/route.ts` (remove any remaining cache imports if not done in Task 10)

- [ ] **Step 1: Delete lib/cpt/cache.ts**

```bash
rm lib/cpt/cache.ts
```

- [ ] **Step 2: Verify no remaining imports of the old cache**

Run: `grep -r "lib/cpt/cache" --include="*.ts" --include="*.tsx" .`

If any files still import from `lib/cpt/cache`, update them to use `lib/kb/path-hash` or `lib/kb/lookup` as appropriate. The `getTranslationCacheKey` function used in search diagnostics should be replaced with `computeQueryHash` from `lib/kb/path-hash`.

- [ ] **Step 3: Verify everything compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(kb): delete old cache module, clean up imports"
```

---

### Task 15: Add .gitignore entry and final verification

**Files:**

- Modify: `.gitignore` (already done — `.superpowers/` was added during brainstorming)

- [ ] **Step 1: Run the linter**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 2: Type-check the full project**

```bash
npx tsc --noEmit --pretty
```

Fix any type errors.

- [ ] **Step 3: Start dev server and manual smoke test**

```bash
npm run dev
```

Test the following scenarios:

1. **Novel query:** Search something that's never been searched. Verify clarification questions appear. Check Supabase for new `kb_synonyms` and `kb_nodes` rows.
2. **Repeat query:** Search the same thing again. Verify questions appear instantly (check server logs — no Claude API calls).
3. **Different phrasing:** Search the same concept with different words. First time: Claude is called. Second time with same words: instant.
4. **Skip clarification:** Click "Show results anyway" mid-clarification. Verify results load.
5. **Results interaction:** Click a provider card. Check `kb_events` table for `result_click` event.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(kb): address lint and type errors from KB integration"
```

---

## Deferred to Fast-Follow

**Synonym clustering (Scenario 2):** The spec describes extending `assessQuery`'s system prompt with known canonical queries so Claude can identify semantic matches on miss. This is intentionally deferred from the initial implementation because:

1. At launch, the canonical query list will be very small (seeded from migration) — most misses will be genuinely novel.
2. The clustering logic requires modifying the Claude prompt in `lib/cpt/prompts.ts`, which is the system's clinical triage moat and should be changed carefully.
3. Without clustering, each unique normalized phrasing creates its own tree. This is correct (not wrong), just less efficient — "knee MRI" and "MRI of my knee" will be separate trees that happen to produce the same results.

**When to add:** After the KB has been running for 2-4 weeks and has 100+ canonical entries. Create a GitHub issue during implementation.

---

## Post-Implementation

After all tasks are complete:

1. **Create a GitHub issue** for the KB implementation work linking to the spec and this plan.
2. **Close issue #37** (cache TTL) — superseded by the KB.
3. **Enable pg_cron jobs** in Supabase dashboard:
   - Go to Database → Extensions → Enable `pg_cron`
   - Run the commented-out `cron.schedule` statements from the migration file via SQL Editor.
4. **Drop translation_cache** after confirming KB is working:
   ```sql
   DROP POLICY IF EXISTS "Anyone can view translation cache" ON translation_cache;
   DROP POLICY IF EXISTS "Anyone can insert translation cache" ON translation_cache;
   DROP POLICY IF EXISTS "Anyone can update translation cache" ON translation_cache;
   DROP TABLE IF EXISTS translation_cache;
   ```
