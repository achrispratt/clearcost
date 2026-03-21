import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  assessQuery,
  clarifyQuery,
  translateQueryToCPT,
} from "@/lib/cpt/translate";
import { kbLookup, getKnownCanonicals } from "@/lib/kb/lookup";
import { writeBackClarifyResponse, writeSynonym } from "@/lib/kb/write-back";
import { logKBEvent } from "@/lib/kb/events";
import { normalizeQuery } from "@/lib/kb/path-hash";
import type {
  ClarificationTurn,
  KBQuestionPayload,
  KBResolutionPayload,
  TranslationResponse,
} from "@/types";

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
      const payload = kbResult.node.payload as
        | KBQuestionPayload
        | KBResolutionPayload;

      // GUARD: Skip depth-0 resolution nodes — the diagnostic must always run.
      // Only return cached responses at depth 0 if they are QUESTION nodes.
      const isDepth0Resolution =
        turns.length === 0 && payload.type === "resolution";

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

    // --- KB MISS — fall through to Claude ---
    try {
      // For initial assessments (no turns), pass known canonicals so Claude
      // can identify synonym matches (e.g. "MRI of my knee" → "knee mri")
      const knownCanonicals =
        turns.length === 0 ? await getKnownCanonicals() : undefined;

      const result =
        turns.length === 0
          ? await assessQuery(queryText, knownCanonicals)
          : await clarifyQuery(queryText, turns);

      // If Claude matched this query to an existing canonical, verify the
      // tree exists before linking the synonym (prevents orphaned synonyms
      // if Claude hallucinated a match)
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

      const canonicalQuery =
        result.canonicalMatch ||
        kbResult.canonical_query ||
        normalizeQuery(queryText);

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
      // INTENTIONAL BYPASS: When the guided search Claude call fails entirely,
      // falling back to single-shot results is better than showing nothing.
      // The client handles this correctly because it checks nextQuestion first
      // (no question = navigate to results).
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
