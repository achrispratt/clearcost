import { NextRequest, NextResponse } from "next/server";
import { assessQuery, clarifyQuery, translateQueryToCPT } from "@/lib/cpt/translate";
import type { ClarificationTurn } from "@/types";

/**
 * POST /api/clarify
 *
 * Multi-turn clarification endpoint for guided search.
 *
 * Body:
 *   - query: string (the user's original search query)
 *   - turns: ClarificationTurn[] (conversation history, empty for initial assessment)
 *
 * Returns: TranslationResponse
 *   - If confidence "high" or conversationComplete: codes are ready for price lookup
 *   - If confidence "low" with nextQuestion: client should display the question
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, turns = [] } = body as {
      query: string;
      turns?: ClarificationTurn[];
    };

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    try {
      // Initial assessment (no turns) or follow-up (with turns)
      const result =
        turns.length === 0
          ? await assessQuery(query)
          : await clarifyQuery(query, turns);

      return NextResponse.json(result);
    } catch (parseError) {
      // If guided search fails (malformed response, etc.), fall back to single-shot
      console.error("Guided search error, falling back to single-shot:", parseError);
      const fallback = await translateQueryToCPT(query);
      return NextResponse.json({
        ...fallback,
        confidence: "high" as const,
        conversationComplete: true,
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
