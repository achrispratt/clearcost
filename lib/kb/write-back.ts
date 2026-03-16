import { createClient } from "@/lib/supabase/server";
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
      ignoreDuplicates: true,
    }
  );

  if (error) {
    console.error("KB node write failed:", error);
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
