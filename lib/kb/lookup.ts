import { createClient } from "@/lib/supabase/server";
import { computeQueryHash, buildPathHash } from "./path-hash";
import type {
  ClarificationTurn,
  KBLookupResult,
  KBNode,
  KBQuestionPayload,
  KBResolutionPayload,
  TranslationResponse,
} from "@/types";

function isValidPayload(
  payload: unknown
): payload is KBQuestionPayload | KBResolutionPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.type === "question" || p.type === "resolution";
}

export function nodeToResponse(
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

export function resolutionPayloadToTranslation(payload: KBResolutionPayload) {
  return {
    codes: payload.codes,
    interpretation: payload.interpretation,
    searchTerms: payload.searchTerms,
    queryType: payload.queryType,
    pricingPlan: payload.pricingPlan,
    laterality: payload.laterality,
    bodySite: payload.bodySite,
  };
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
  const { queryHash, normalizedQuery } = computeQueryHash(query);
  const supabase = await createClient();

  // Step 1: synonym lookup
  const { data: synonym, error: synError } = await supabase
    .from("kb_synonyms")
    .select("canonical_query")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (synError || !synonym) {
    return { hit: false, queryHash, normalizedQuery };
  }

  const canonicalQuery = synonym.canonical_query;

  // Step 2: build path_hash from canonical + turns
  const pathHash = buildPathHash(canonicalQuery, turns);
  if (!pathHash) {
    return { hit: false, canonical_query: canonicalQuery, queryHash, normalizedQuery };
  }

  // Step 3: node lookup
  const { data: node, error: nodeError } = await supabase
    .from("kb_nodes")
    .select("*")
    .eq("path_hash", pathHash)
    .maybeSingle();

  if (nodeError || !node || !isValidPayload(node.payload)) {
    return { hit: false, canonical_query: canonicalQuery, path_hash: pathHash, queryHash, normalizedQuery };
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
    queryHash,
    normalizedQuery,
  };
}

/**
 * Synonym-only lookup. Returns canonical_query if the query has been seen before.
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
