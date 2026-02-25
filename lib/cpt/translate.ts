import { getAnthropicClient } from "@/lib/anthropic";
import {
  CPT_TRANSLATION_SYSTEM_PROMPT,
  GUIDED_SEARCH_SYSTEM_PROMPT,
  buildTranslationPrompt,
  buildGuidedSearchPrompt,
  buildClarificationPrompt,
} from "./prompts";
import type {
  CPTCode,
  BillingCodeType,
  ClarificationTurn,
  TranslationResponse,
} from "@/types";

interface TranslationResult {
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
}

/**
 * Strips markdown code fences and parses JSON from Claude's response text.
 */
function parseJsonResponse(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

/**
 * Maps raw code objects from Claude's response to our CPTCode type.
 */
function mapCodes(
  rawCodes: Array<{
    code: string;
    codeType?: string;
    description: string;
    category: string;
  }>
): CPTCode[] {
  return rawCodes.map((code) => ({
    code: code.code,
    description: code.description,
    category: code.category,
    codeType: (code.codeType || "cpt") as BillingCodeType,
  }));
}

/**
 * Translates a plain English healthcare query into billing codes via Claude.
 * Single-shot — used by /api/search for backward compatibility.
 */
export async function translateQueryToCPT(
  query: string
): Promise<TranslationResult> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: CPT_TRANSLATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildTranslationPrompt(query) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  const parsed = parseJsonResponse(content.text);
  const codes = mapCodes(
    (parsed.codes as Array<{
      code: string;
      codeType?: string;
      description: string;
      category: string;
    }>) || []
  );

  return {
    codes,
    interpretation: (parsed.interpretation as string) || "",
    searchTerms: (parsed.searchTerms as string) || query,
  };
}

/**
 * Guided search: initial assessment of a user query.
 * Returns either high-confidence codes or the first clarifying question.
 */
export async function assessQuery(
  query: string
): Promise<TranslationResponse> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: GUIDED_SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildGuidedSearchPrompt(query) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  const parsed = parseJsonResponse(content.text);
  return buildTranslationResponse(parsed);
}

/**
 * Guided search: multi-turn clarification.
 * Sends the full conversation history and gets back either the next question
 * or final billing codes.
 */
export async function clarifyQuery(
  query: string,
  turns: ClarificationTurn[]
): Promise<TranslationResponse> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: GUIDED_SEARCH_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildClarificationPrompt(query, turns) },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  const parsed = parseJsonResponse(content.text);
  return buildTranslationResponse(parsed);
}

/**
 * Maps Claude's raw JSON response into a typed TranslationResponse.
 */
function buildTranslationResponse(
  parsed: Record<string, unknown>
): TranslationResponse {
  const codes = mapCodes(
    (parsed.codes as Array<{
      code: string;
      codeType?: string;
      description: string;
      category: string;
    }>) || []
  );

  return {
    codes,
    interpretation: (parsed.interpretation as string) || "",
    searchTerms: (parsed.searchTerms as string) || undefined,
    confidence: (parsed.confidence as "high" | "low") || "low",
    queryType: parsed.queryType as TranslationResponse["queryType"],
    nextQuestion: parsed.nextQuestion as TranslationResponse["nextQuestion"],
    conversationComplete: (parsed.conversationComplete as boolean) || false,
  };
}
