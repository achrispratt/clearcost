import { getAnthropicClient } from "@/lib/anthropic";
import {
  CPT_TRANSLATION_SYSTEM_PROMPT,
  buildTranslationPrompt,
} from "./prompts";
import type { CPTCode, BillingCodeType } from "@/types";

interface TranslationResult {
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string; // Fallback keywords for description-based search
}

/**
 * Translates a plain English healthcare query into billing codes via Claude.
 *
 * Changes from v1:
 * - No longer verifies against a static 45-code lookup table
 * - Any valid CPT/HCPCS code Claude returns is passed to the database
 * - Returns searchTerms for fallback text search if code-based search yields zero results
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

  const parsed = JSON.parse(content.text);

  // Map Claude's response to our CPTCode type
  // No verification gate — we trust Claude's output and let the database filter
  const codes: CPTCode[] = (parsed.codes || []).map(
    (code: {
      code: string;
      codeType?: string;
      description: string;
      category: string;
    }) => ({
      code: code.code,
      description: code.description,
      category: code.category,
      codeType: (code.codeType || "cpt") as BillingCodeType,
    })
  );

  return {
    codes,
    interpretation: parsed.interpretation || "",
    searchTerms: parsed.searchTerms || query,
  };
}
