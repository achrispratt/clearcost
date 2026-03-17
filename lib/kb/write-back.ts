import { createClient } from "@/lib/supabase/server";
import {
  computeQueryHash,
  buildPathHashFromSegments,
  turnsToSegments,
} from "./path-hash";
import type {
  BodySite,
  ClarificationTurn,
  CPTCode,
  KBQuestionPayload,
  KBResolutionPayload,
  KBSource,
  Laterality,
  PricingPlan,
  QueryType,
  TranslationResponse,
} from "@/types";

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

export async function writeNode(params: {
  canonicalQuery: string;
  answerSegments: string[];
  depth: number;
  payload: KBQuestionPayload | KBResolutionPayload;
  source?: KBSource;
}): Promise<string> {
  const {
    canonicalQuery,
    answerSegments,
    depth,
    payload,
    source = "claude",
  } = params;
  const nodeType = payload.type;

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
      ignoreDuplicates: true,
    }
  );

  if (error) {
    console.error("KB node write failed:", error);
  }

  return pathHash;
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

  const pathHash = await writeNode({
    canonicalQuery,
    answerSegments: segments,
    depth: turns.length,
    payload,
  });

  return pathHash;
}

export async function writeResolutionToKB(params: {
  query: string;
  canonicalQuery: string;
  result: {
    codes: CPTCode[];
    interpretation: string;
    searchTerms?: string;
    queryType?: QueryType;
    pricingPlan?: PricingPlan;
    laterality?: Laterality;
    bodySite?: BodySite;
  };
}): Promise<void> {
  const { query, canonicalQuery, result } = params;
  await writeSynonym(query, canonicalQuery);
  await writeNode({
    canonicalQuery,
    answerSegments: [],
    depth: 0,
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
  });
}
