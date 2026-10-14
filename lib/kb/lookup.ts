import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeQueryHash,
  buildPathHash,
  buildPathHashFromSegments,
  turnToSegment,
} from "./path-hash";
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
 * 1. Hash the query → look up kb_synonyms for canonical form.
 * 2. Build path_hash from canonical + turns → look up kb_nodes.
 * 3. If hit, bump hit_count and return the node.
 */
export async function kbLookup(
  query: string,
  turns: ClarificationTurn[]
): Promise<KBLookupResult> {
  const { queryHash } = computeQueryHash(query);
  const supabase = createAdminClient();

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

  // Bump hit_count (fire-and-forget)
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
 * Rebuild the question text asked before each turn from the KB tree, so the
 * Claude prompt never carries client-supplied question ids or text (#163).
 *
 * The question before turns[i] is the payload of the node at
 * canonical + answers[0..i). Returns one entry per turn: the question text,
 * or null when that node isn't cached (e.g. after a free-text "other" answer,
 * which is never cached) or isn't a question.
 */
export async function getAskedQuestions(
  canonicalQuery: string,
  turns: ClarificationTurn[]
): Promise<(string | null)[]> {
  const parentHashes: (string | null)[] = [];
  const segments: string[] = [];
  let cacheable = true;
  for (const turn of turns) {
    parentHashes.push(
      cacheable ? buildPathHashFromSegments(canonicalQuery, segments) : null
    );
    const segment = turnToSegment(turn);
    if (segment === null) cacheable = false;
    else segments.push(segment);
  }

  const hashes = parentHashes.filter((h): h is string => h !== null);
  if (hashes.length === 0) return turns.map(() => null);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("kb_nodes")
    .select("path_hash, payload")
    .in("path_hash", hashes);

  if (error || !data) return turns.map(() => null);

  const questionByHash = new Map<string, string>();
  for (const row of data) {
    const payload: unknown = row.payload;
    if (
      isValidPayload(payload) &&
      payload.type === "question" &&
      typeof payload.question?.question === "string"
    ) {
      questionByHash.set(row.path_hash, payload.question.question);
    }
  }

  return parentHashes.map((h) => (h ? (questionByHash.get(h) ?? null) : null));
}

/**
 * Synonym-only lookup. Returns canonical_query if the query has been seen before.
 */
export async function kbSynonymLookup(query: string): Promise<string | null> {
  const { queryHash } = computeQueryHash(query);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("kb_synonyms")
    .select("canonical_query")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error || !data) return null;
  return data.canonical_query;
}
