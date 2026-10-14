import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  assessQuery,
  clarifyQuery,
  translateQueryToCPT,
} from "@/lib/cpt/translate";
import { kbLookup, getAskedQuestions } from "@/lib/kb/lookup";
import { matchCanonical } from "@/lib/kb/semantic";
import { writeBackClarifyResponse, writeSynonym } from "@/lib/kb/write-back";
import { logKBEvent } from "@/lib/kb/events";
import { normalizeQuery } from "@/lib/kb/path-hash";
import { validateQuery, validateTurns } from "@/lib/api-limits";
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

    const inputError = validateQuery(queryText) ?? validateTurns(turns);
    if (inputError) {
      return NextResponse.json({ error: inputError }, { status: 400 });
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

    // --- SEMANTIC MATCH — new phrasing of a known query (#164) ---
    // Only for brand-new queries: embed, find the nearest known canonical
    // above a strict threshold, and serve its cached first question. Bounded
    // by a timeout, so a slow embedding just falls through to Claude.
    if (turns.length === 0 && !kbResult.canonical_query) {
      const matched = await matchCanonical(queryText);
      const matchedLookup = matched ? await kbLookup(matched, []) : null;
      const matchedPayload = matchedLookup?.node?.payload as
        | KBQuestionPayload
        | KBResolutionPayload
        | undefined;

      if (
        matched &&
        matchedLookup?.hit &&
        matchedPayload?.type === "question"
      ) {
        writeSynonym(queryText, matched).catch((err) =>
          console.error("KB synonym clustering write failed:", err)
        );
        if (matchedLookup.path_hash) {
          logKBEvent({
            pathHash: matchedLookup.path_hash,
            eventType: "walk",
            sessionId,
          }).catch(() => {});
        }

        return NextResponse.json({
          ...nodeToResponse(matchedPayload),
          kbSessionId: sessionId,
          kbPathHash: matchedLookup.path_hash,
        });
      }
    }

    // --- KB MISS — fall through to Claude ---
    try {
      // Rebuild prior question text from our own KB tree; the client's
      // questionId is an opaque UI key and never reaches the prompt (#163).
      const askedQuestions =
        turns.length > 0
          ? await getAskedQuestions(
              kbResult.canonical_query || normalizeQuery(queryText),
              turns
            ).catch((err) => {
              console.error("KB question history lookup failed:", err);
              return [];
            })
          : [];

      const result =
        turns.length === 0
          ? await assessQuery(queryText)
          : await clarifyQuery(queryText, turns, askedQuestions);

      const canonicalQuery =
        kbResult.canonical_query || normalizeQuery(queryText);

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
