import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/observability";
import {
  computeQueryHash,
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

export async function writeSynonym(
  query: string,
  canonicalQuery: string
): Promise<void> {
  const { normalizedQuery, queryHash } = computeQueryHash(query);
  const supabase = createAdminClient();

  const { error } = await supabase.from("kb_synonyms").upsert(
    {
      query_hash: queryHash,
      normalized_query: normalizedQuery,
      canonical_query: canonicalQuery,
    },
    { onConflict: "query_hash" }
  );

  if (error) {
    reportError(error, "KB synonym write failed:");
  }
}

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
  const supabase = createAdminClient();
  const row = {
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
  };

  // First write wins: an existing node is never overwritten, so one crafted
  // request can't replace the node every later user on that path is served (#163).
  const { error } = await supabase
    .from("kb_nodes")
    .upsert(row, { onConflict: "path_hash", ignoreDuplicates: true });

  if (error) {
    reportError(error, "KB node write failed:");
    return pathHash;
  }

  // Exception: a node auto-flagged for re-evaluation (#126) is replaced by
  // this fresh answer. The RPC archives the old version to kb_node_history,
  // bumps version and clears the flag; it is a no-op for unflagged nodes.
  // Runs before the depth-0 replace below so that never touches a flagged row.
  const { error: replaceFlaggedError } = await supabase.rpc(
    "kb_replace_flagged_node",
    {
      p_path_hash: pathHash,
      p_canonical_query: canonicalQuery,
      p_answer_path: answerSegments,
      p_depth: depth,
      p_node_type: nodeType,
      p_payload: payload,
      p_source: source,
    }
  );
  if (replaceFlaggedError) {
    reportError(replaceFlaggedError, "KB flagged-node replace failed:");
  }

  // Another exception: a depth-0 question replaces a depth-0 resolution (written
  // by /api/search), which guided search skips anyway. Without this, a query
  // first seen on /results could never cache its first diagnostic question.
  if (depth === 0 && nodeType === "question") {
    const { error: replaceError } = await supabase
      .from("kb_nodes")
      .update(row)
      .eq("path_hash", pathHash)
      .eq("node_type", "resolution");
    if (replaceError) {
      reportError(replaceError, "KB depth-0 resolution replace failed:");
    }
  }

  return pathHash;
}

export function turnsToSegments(turns: ClarificationTurn[]): string[] | null {
  const segments: string[] = [];
  for (const turn of turns) {
    const segment = turnToSegment(turn);
    if (segment === null) return null;
    segments.push(segment);
  }
  return segments;
}

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
