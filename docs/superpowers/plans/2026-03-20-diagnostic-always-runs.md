# Diagnostic Always Runs — Fix Guided Search Bypass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the guided search diagnostic flow ALWAYS runs. The KB speeds up loading diagnostic questions (instant, zero AI cost), but never skips them. No hardcoded skip logic anywhere — the only "fast path" is the KB serving cached questions instantly.

**Architecture:** Four-layer fix: (1) client removes all confidence-based redirect logic and follows the server blindly, (2) server guard in `/api/clarify` ignores depth-0 resolution nodes and falls through to get a question, (3) system prompt instructs Claude to always walk the full diagnostic before resolving, (4) write-back guard prevents new depth-0 resolution nodes from entering the KB. A cleanup script removes existing stale nodes.

**Tech Stack:** Next.js API routes, Vitest, Supabase (kb_nodes table), Claude API system prompts

---

## Root Cause Trace

```
User: "knee MRI"
        │
        ▼
┌──────────────────────────────────────────────────────┐
│  /api/clarify  (server, Vercel)                      │
│  kbLookup("knee mri", [])                            │
│  → hit: true, node_type: "resolution", depth: 0     │◄── ROOT CAUSE 1
│  → returns { confidence: "high", codes: [...],       │    KB has resolution
│              conversationComplete: true }             │    at tree root
└────────────┬─────────────────────────────────────────┘
             │  JSON response
             ▼
┌──────────────────────────────────────────────────────┐
│  useClarificationState.ts  (browser)                 │
│  handleResponse() checks:                            │
│  if (confidence === "high" || conversationComplete)  │◄── ROOT CAUSE 2
│    → goToResults()  immediately                      │    Client has its own
│                                                      │    skip logic
└────────────┬─────────────────────────────────────────┘
             │
             ▼
        /results page  (diagnostic SKIPPED)
```

**How depth-0 resolutions got into the KB:**
- `/api/cpt` route (route.ts:39-56) writes a resolution node at depth 0 for EVERY query via `writeNode()`
- `/api/clarify` write-back (write-back.ts:105-106) writes resolution when Claude returns `confidence: "high"` — even at depth 0
- System prompt (prompts.ts:85) tells Claude: "If specific enough → return billing codes directly"

## Design Principle

**No hardcoded skip logic.** The code should never say "skip the diagnostic." The diagnostic tree is always walked. The only way the tree becomes shorter is through learned behavior stored in the KB over time — e.g., if a query consistently resolves through 2 questions instead of 4, the KB tree for that query has 2 question nodes. But that tree is still walked; questions are still shown. The KB makes it instant, not skipped.

## Scope

**In scope:**
- Diagnostic always runs (never skips to results)
- KB serves cached questions instantly (reduce Claude calls / latency)
- Remove all hardcoded skip logic
- Clean up stale KB data

**Out of scope (separate issues):**
- Full visit cost display (facility fees, professional fees, adders) — this is a results page concern
- Pre-seeding KB trees for common queries
- Minimum-turns configuration

**Known intentional bypass:** The `/api/clarify` route has a catch block (lines 149-160) that falls back to `translateQueryToCPT()` when the guided search Claude call errors. This fallback returns `conversationComplete: true` with no `nextQuestion`, which sends the user straight to results. This is intentional — when Claude itself fails, showing single-shot results is better than showing nothing. The client handles this correctly because it checks `nextQuestion` first (no question = navigate to results). A comment should be added in the catch block during implementation to document this design decision.

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `app/guided-search/useClarificationState.ts:111-154` | Remove all confidence-based redirect logic |
| Modify | `app/api/clarify/route.ts:66-86, 103-129` | Skip depth-0 resolution nodes; guard synonym clustering |
| Modify | `lib/cpt/prompts.ts:83-86, 297-307` | Claude always walks the full diagnostic |
| Modify | `lib/kb/write-back.ts:92-141` | Never write resolution at depth 0 |
| Modify | `app/api/cpt/route.ts:33-56` | Stop writing KB nodes from legacy route |
| Create | `scripts/kb-clean-depth0-resolutions.ts` | One-time cleanup of stale depth-0 resolution nodes |
| Modify | `__tests__/api/clarify.test.ts` | Test: depth-0 resolution nodes are ignored |
| Modify | `__tests__/api/cpt.test.ts` | Test: legacy route no longer writes KB nodes |
| Create | `__tests__/unit/write-back-guard.test.ts` | Test: write-back refuses resolution at depth 0 |

---

## Task 1: Client — remove all confidence-based redirect logic

The client should have zero opinion about when the diagnostic is done. It follows the server response blindly:
- Server returns `nextQuestion` → show it
- Server returns `conversationComplete: true` + codes, no `nextQuestion` → go to results

No confidence checks. No turn counting. The server decides.

**Files:**
- Modify: `app/guided-search/useClarificationState.ts:111-154`

- [ ] **Step 1: Simplify `handleResponse` — remove confidence-based branching**

Replace the entire `handleResponse` callback. Currently (lines 111-154) it checks `confidence === "high" || conversationComplete` and auto-redirects. Replace with server-following logic:

```typescript
const handleResponse = useCallback(
  (data: TranslationResponse) => {
    setInterpretation(data.interpretation || "");
    if (data.pricingPlan) {
      setPricingPlan(data.pricingPlan);
    }

    if (data.codes && data.codes.length > 0) {
      setAllCodes(data.codes);
    }

    // Follow the server response — no client-side skip logic.
    // If the server says there's a question to ask, show it.
    // If the server says the conversation is complete, go to results.
    if (data.nextQuestion) {
      setCurrentQuestion(data.nextQuestion);
      setPhase("clarifying");
      setSelectedOption(null);
      setFreeText("");
      return;
    }

    // No nextQuestion — conversation is complete (or server couldn't produce a question).
    // Navigate to results with whatever codes we have.
    if (data.codes && data.codes.length > 0) {
      goToResults(data.codes, data.interpretation || "", data.pricingPlan);
    } else {
      // Server returned neither a question nor codes — malformed response.
      // Show error with skip option so the user isn't stuck.
      // This triggers the existing error UI (guided-search/page.tsx lines 76-95)
      // which has a "Skip to results" button that does a text search.
      setError("We couldn't process your query. You can try searching directly.");
      setPhase("clarifying");
    }
  },
  [goToResults, navigateToResults, buildResultsParams]
);
```

Key change: `nextQuestion` is checked FIRST. If the server sends a question, we show it — period. We don't check confidence or conversationComplete to override that decision. Only when there's no question do we navigate to results.

- [ ] **Step 2: Verify no other code references `confidence` in the client**

Search `useClarificationState.ts` and the guided search page for any other references to `confidence` or `conversationComplete`. There should be none after this change.

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: ALL PASS. This file has no direct tests (it's a React hook), but changes shouldn't break API-level tests.

- [ ] **Step 4: Commit**

```bash
git add app/guided-search/useClarificationState.ts
git commit -m "fix: client follows server response — no confidence-based skip logic"
```

---

## Task 2: Server guard — skip depth-0 resolution nodes in `/api/clarify`

The server should never return a resolution node at depth 0. When the KB has a stale depth-0 resolution, the server skips it and falls through to Claude to get the first diagnostic question.

**Files:**
- Modify: `app/api/clarify/route.ts:66-86, 103-129`
- Modify: `__tests__/api/clarify.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `__tests__/api/clarify.test.ts`:

```typescript
it("ignores depth-0 resolution nodes and falls through to Claude", async () => {
  vi.mocked(kbLookup).mockResolvedValue({
    hit: true,
    canonical_query: "knee mri",
    path_hash: "abc123",
    node: {
      path_hash: "abc123",
      canonical_query: "knee mri",
      answer_path: [],
      depth: 0,
      node_type: "resolution",
      payload: {
        type: "resolution" as const,
        codes: [{ code: "73721", description: "MRI knee", category: "Imaging" }],
        interpretation: "Knee MRI",
        confidence: "high" as const,
        conversationComplete: true,
      },
      hit_count: 5,
      version: 1,
      source: "claude",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    },
  });

  vi.mocked(assessQuery).mockResolvedValue({
    codes: [],
    interpretation: "You need a knee MRI",
    confidence: "low" as const,
    nextQuestion: {
      id: "q_laterality",
      question: "Which knee do you need imaged?",
      options: [
        { label: "Left knee" },
        { label: "Right knee" },
        { label: "Both knees" },
      ],
    },
    conversationComplete: false,
  });

  const res = await POST(makeRequest({ query: "knee MRI" }));
  expect(res.status).toBe(200);

  const data = await res.json();
  expect(assessQuery).toHaveBeenCalled();
  expect(data.nextQuestion).toBeDefined();
  expect(data.nextQuestion.question).toContain("knee");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/api/clarify.test.ts -t "ignores depth-0 resolution"`

Expected: FAIL — currently returns the cached resolution without calling Claude.

- [ ] **Step 3: Implement the guard**

Edit `app/api/clarify/route.ts` — modify the KB hit section (lines 68-86):

```typescript
if (kbResult.hit && kbResult.node) {
  const payload = kbResult.node.payload as KBQuestionPayload | KBResolutionPayload;

  // GUARD: Skip depth-0 resolution nodes — the diagnostic must always run.
  // Only return cached responses at depth 0 if they are QUESTION nodes.
  const isDepth0Resolution = turns.length === 0 && payload.type === "resolution";

  if (!isDepth0Resolution) {
    if (kbResult.path_hash) {
      logKBEvent({
        pathHash: kbResult.path_hash,
        eventType: "walk",
        sessionId,
      });
    }

    const response = nodeToResponse(payload);

    return NextResponse.json({
      ...response,
      kbSessionId: sessionId,
      kbPathHash: kbResult.path_hash,
    });
  }
  // else: fall through to Claude for the first diagnostic question
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/api/clarify.test.ts -t "ignores depth-0 resolution"`

Expected: PASS.

- [ ] **Step 5: Guard the synonym clustering path too**

The same bug exists in the synonym clustering section (lines 103-129). When Claude identifies a canonical match and the tree root is a resolution, it returns the resolution directly.

Edit lines 103-129:

```typescript
if (result.canonicalMatch && turns.length === 0) {
  const matchedLookup = await kbLookup(result.canonicalMatch, []);
  if (matchedLookup.hit && matchedLookup.node) {
    const matchedPayload = matchedLookup.node.payload as
      | KBQuestionPayload
      | KBResolutionPayload;

    // Write the synonym link regardless — it's valid
    writeSynonym(queryText, result.canonicalMatch).catch((err) =>
      console.error("KB synonym clustering write failed:", err)
    );

    // Only return the cached node if it's a question, not a depth-0 resolution
    if (matchedPayload.type === "question") {
      if (matchedLookup.path_hash) {
        logKBEvent({
          pathHash: matchedLookup.path_hash,
          eventType: "walk",
          sessionId,
        }).catch(() => {});
      }

      const matchedResponse = nodeToResponse(matchedPayload);
      return NextResponse.json({
        ...matchedResponse,
        kbSessionId: sessionId,
        kbPathHash: matchedLookup.path_hash,
      });
    }
    // else: depth-0 resolution — fall through and use Claude's response
  }
}
```

- [ ] **Step 6: Update the existing synonym clustering test**

The existing test "handles synonym clustering: links synonym when tree exists" (line 129) tests a depth-0 resolution being returned via synonym match. Update it — the synonym should still be written, but Claude's question response should be returned instead of the cached resolution:

```typescript
it("handles synonym clustering: writes synonym but falls through for depth-0 resolution", async () => {
  vi.mocked(kbLookup)
    .mockResolvedValueOnce({ hit: false })
    .mockResolvedValueOnce({
      hit: true,
      canonical_query: "knee mri",
      path_hash: "existing-hash",
      node: {
        path_hash: "existing-hash",
        canonical_query: "knee mri",
        answer_path: [],
        depth: 0,
        node_type: "resolution",
        payload: {
          type: "resolution" as const,
          codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
          interpretation: "Knee MRI",
          confidence: "high" as const,
          conversationComplete: true,
        },
        hit_count: 5,
        version: 1,
        source: "claude",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    });

  vi.mocked(assessQuery).mockResolvedValue({
    codes: [],
    interpretation: "You need a knee MRI",
    confidence: "low" as const,
    nextQuestion: {
      id: "q1",
      question: "Which knee?",
      options: [{ label: "Left" }, { label: "Right" }],
    },
    conversationComplete: false,
    canonicalMatch: "knee mri",
  });

  const res = await POST(makeRequest({ query: "I need an MRI on my knee" }));
  expect(res.status).toBe(200);

  const data = await res.json();
  // Should return Claude's question, NOT the cached resolution
  expect(data.nextQuestion).toBeDefined();
  expect(data.nextQuestion.question).toBe("Which knee?");

  // Synonym should still be written
  expect(writeSynonym).toHaveBeenCalledWith(
    "I need an MRI on my knee",
    "knee mri"
  );
});
```

- [ ] **Step 7: Run full test suite**

Run: `npm test`

Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/clarify/route.ts __tests__/api/clarify.test.ts
git commit -m "fix: /api/clarify skips depth-0 resolution nodes, falls through to Claude"
```

---

## Task 3: System prompt — always walk the full diagnostic

The prompt currently tells Claude to "return billing codes directly" for clear queries. Change it to always ask all relevant diagnostic questions before resolving.

**Files:**
- Modify: `lib/cpt/prompts.ts:83-86, 297-307`

- [ ] **Step 1: Update the "How You Work" section**

Edit `lib/cpt/prompts.ts` — change lines 83-88 in `GUIDED_SEARCH_SYSTEM_PROMPT`:

From:
```
## How You Work

1. Assess the query — classify it and decide if you have enough information
2. If the query is specific enough → return billing codes directly (confidence: "high")
3. If the query is ambiguous → ask ONE clarifying question at a time (confidence: "low")
4. Each question should meaningfully narrow the possibilities
5. After enough questions (or max 6 turns), resolve to specific codes
```

To:
```
## How You Work

1. Assess the query — classify it and decide what clarifying question to ask FIRST
2. ALWAYS ask at least one clarifying question before resolving — even for specific queries like "knee MRI" or "CPT 73721"
   - For imaging: ask about contrast preference (with/without/both) or laterality (left/right/bilateral), whichever is unknown
   - For procedures: ask about laterality or specific variant
   - For conditions/symptoms: ask the first triage question from the protocol below
   - For explicit billing codes: confirm the procedure and ask about relevant variants
3. Only set confidence: "high" and conversationComplete: true AFTER you have asked all questions from the relevant triage protocol that would change the billing codes or provide useful pricing context
4. Each question should meaningfully narrow the possibilities
5. After enough questions (or max 6 turns), resolve to specific codes
```

- [ ] **Step 2: Update the Query Types section**

Change the `"procedure"` and `"code"` entries:

From:
```
- **"code"**: User specified a billing code (e.g., "CPT 73721"). Return it directly. Confidence: high.
- **"procedure"**: User named a specific procedure (e.g., "knee MRI without contrast"). May need 0-2 questions. Confidence depends on specificity.
```

To:
```
- **"code"**: User specified a billing code (e.g., "CPT 73721"). Still ask at least one question — confirm the procedure and ask about variants that affect pricing (laterality, contrast). Confidence: low on first assessment.
- **"procedure"**: User named a specific procedure (e.g., "knee MRI"). Always needs at least 1 question (contrast, laterality). Confidence: low on first assessment, high only after all relevant triage questions are answered.
```

- [ ] **Step 3: Update the `buildGuidedSearchPrompt` function**

Edit `lib/cpt/prompts.ts` — change lines 301-307:

From:
```typescript
let prompt = `A patient is looking for healthcare pricing. Their query: "${query}"

Assess this query:
1. Classify it (code, procedure, condition, or symptom)
2. If specific enough to identify 1-3 billing codes with high confidence, return them directly
3. If ambiguous, ask your FIRST clarifying question to narrow down what they need
4. Always include pricingPlan with baseCodeGroups + adders in your JSON`;
```

To:
```typescript
let prompt = `A patient is looking for healthcare pricing. Their query: "${query}"

Assess this query:
1. Classify it (code, procedure, condition, or symptom)
2. Ask your FIRST clarifying question — even for clear queries, ask about the most important unknown (contrast, laterality, or procedure variant)
3. Set confidence: "low" — you are asking a question, not resolving yet
4. Always include pricingPlan with baseCodeGroups + adders in your JSON`;
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: ALL PASS. Prompt changes don't break existing tests (they mock Claude responses).

- [ ] **Step 5: Commit**

```bash
git add lib/cpt/prompts.ts
git commit -m "fix: system prompt always walks full diagnostic before resolving"
```

---

## Task 4: Write-back guard — never write resolution at depth 0

Prevent new depth-0 resolution nodes from entering the KB. Only question nodes should exist at the root of a KB tree.

**Files:**
- Modify: `lib/kb/write-back.ts:92-141`
- Create: `__tests__/unit/write-back-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/write-back-guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

vi.mock("@/lib/kb/path-hash", () => ({
  computeQueryHash: vi.fn().mockReturnValue({
    normalizedQuery: "knee mri",
    queryHash: "hash123",
  }),
  buildPathHashFromSegments: vi.fn().mockReturnValue("path123"),
  turnToSegment: vi.fn().mockReturnValue("segment"),
}));

import { writeBackClarifyResponse } from "@/lib/kb/write-back";

beforeEach(() => vi.clearAllMocks());

describe("writeBackClarifyResponse depth-0 guard", () => {
  it("does NOT write resolution node at depth 0 (no turns)", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [],
      response: {
        codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
        interpretation: "Knee MRI",
        confidence: "high",
        conversationComplete: true,
      },
    });

    expect(result).toBeNull();
  });

  it("DOES write question node at depth 0", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [],
      response: {
        codes: [],
        interpretation: "Need to clarify",
        confidence: "low",
        conversationComplete: false,
        nextQuestion: {
          id: "q1",
          question: "Which knee?",
          options: [{ label: "Left" }, { label: "Right" }],
        },
      },
    });

    expect(result).toBe("path123");
  });

  it("DOES write resolution node at depth > 0", async () => {
    const result = await writeBackClarifyResponse({
      originalQuery: "knee MRI",
      canonicalQuery: "knee mri",
      turns: [{ questionId: "q1", selectedOption: "Left knee" }],
      response: {
        codes: [{ code: "73721", description: "MRI", category: "Imaging" }],
        interpretation: "Left knee MRI",
        confidence: "high",
        conversationComplete: true,
      },
    });

    expect(result).toBe("path123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/unit/write-back-guard.test.ts`

Expected: FAIL on the first test — currently writes resolution at depth 0.

- [ ] **Step 3: Add the guard**

Edit `lib/kb/write-back.ts` — add guard early in `writeBackClarifyResponse`:

```typescript
export async function writeBackClarifyResponse(params: {
  originalQuery: string;
  canonicalQuery: string;
  turns: ClarificationTurn[];
  response: TranslationResponse;
}): Promise<string | null> {
  const { originalQuery, canonicalQuery, turns, response } = params;

  await writeSynonym(originalQuery, canonicalQuery);

  const segments = turnsToSegments(turns);
  if (segments === null) return null;

  const isResolution =
    response.confidence === "high" || response.conversationComplete;

  // GUARD: Never write resolution nodes at depth 0.
  // The diagnostic must always run — depth-0 nodes should only be questions.
  if (isResolution && turns.length === 0) {
    return null;
  }

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

- [ ] **Step 4: Run tests**

Run: `npm test -- __tests__/unit/write-back-guard.test.ts`

Expected: ALL PASS.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/kb/write-back.ts __tests__/unit/write-back-guard.test.ts
git commit -m "fix: write-back guard prevents resolution nodes at depth 0"
```

---

## Task 5: Stop `/api/cpt` from writing KB nodes

The legacy `/api/cpt` route writes resolution nodes at depth 0 for every query. This is the original source of KB pollution. The guided search path (`/api/clarify`) has its own write-back; `/api/cpt` should stop writing.

**Files:**
- Modify: `app/api/cpt/route.ts:33-56`
- Modify: `__tests__/api/cpt.test.ts`

- [ ] **Step 1: Update the test expectation**

Edit `__tests__/api/cpt.test.ts` — in the "calls Claude on KB miss" test, change:

```typescript
expect(writeSynonym).toHaveBeenCalled();
expect(writeNode).toHaveBeenCalled();
```

To:

```typescript
expect(writeSynonym).not.toHaveBeenCalled();
expect(writeNode).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/api/cpt.test.ts -t "calls Claude on KB miss"`

Expected: FAIL.

- [ ] **Step 3: Remove KB write-back from `/api/cpt`**

Edit `app/api/cpt/route.ts` — remove lines 33-56 (synonym write + node write after Claude call). Also remove unused imports (`writeSynonym`, `writeNode`, `normalizeQuery`). Keep `KBResolutionPayload` — it's still used by the KB read path.

The route becomes:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { kbLookup } from "@/lib/kb/lookup";
import type { KBResolutionPayload } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

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

    const result = await translateQueryToCPT(query);
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

- [ ] **Step 4: Remove the "silent failure" test**

Delete the test at line 120 ("still returns result even if KB write-back fails") — no longer relevant since we removed write-back.

- [ ] **Step 5: Run tests**

Run: `npm test -- __tests__/api/cpt.test.ts`

Expected: ALL PASS.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/cpt/route.ts __tests__/api/cpt.test.ts
git commit -m "fix: /api/cpt stops writing KB nodes (guided search owns write-back)"
```

---

## Task 6: Clean up existing depth-0 resolution nodes

Existing stale depth-0 resolution nodes need to be removed. The server guard (Task 2) catches them at runtime, but cleaning them up removes unnecessary KB lookups.

**Files:**
- Create: `scripts/kb-clean-depth0-resolutions.ts`

- [ ] **Step 1: Write the cleanup script**

Create `scripts/kb-clean-depth0-resolutions.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: nodes, error: fetchError } = await supabase
    .from("kb_nodes")
    .select("path_hash, canonical_query, node_type, hit_count")
    .eq("depth", 0)
    .eq("node_type", "resolution");

  if (fetchError) {
    console.error("Failed to fetch nodes:", fetchError);
    process.exit(1);
  }

  if (!nodes || nodes.length === 0) {
    console.log("No depth-0 resolution nodes found. Nothing to clean up.");
    return;
  }

  console.log(`Found ${nodes.length} depth-0 resolution nodes to delete:`);
  for (const node of nodes) {
    console.log(
      `  - "${node.canonical_query}" (hits: ${node.hit_count}, hash: ${node.path_hash})`
    );
  }

  const hashes = nodes.map((n) => n.path_hash);
  const { error: deleteError, count } = await supabase
    .from("kb_nodes")
    .delete({ count: "exact" })
    .in("path_hash", hashes);

  if (deleteError) {
    console.error("Failed to delete nodes:", deleteError);
    process.exit(1);
  }

  console.log(`\nDeleted ${count} depth-0 resolution nodes.`);
  console.log("New question nodes will be created as users go through the diagnostic.");
}

main();
```

- [ ] **Step 2: Run the script**

Run: `npx tsx --env-file=.env.local scripts/kb-clean-depth0-resolutions.ts`

Review output — confirm the listed queries make sense.

- [ ] **Step 3: Commit**

```bash
git add scripts/kb-clean-depth0-resolutions.ts
git commit -m "chore: add script to clean depth-0 resolution nodes from KB"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: ALL PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: Clean.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Test these scenarios:
1. **"knee MRI"** → should show diagnostic question (laterality or contrast), NOT results
2. **Answer a question** → should show next question or results
3. **"knee MRI" a second time** → first question should load instantly from KB (no spinner)
4. **"my head hurts"** → should show symptom triage questions
5. **"CPT 73721"** → should still show a diagnostic question (confirm procedure, ask about variants)

- [ ] **Step 4: Run the KB cleanup script**

Run: `npx tsx --env-file=.env.local scripts/kb-clean-depth0-resolutions.ts`
