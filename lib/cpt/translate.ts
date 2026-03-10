import { getAnthropicClient } from "@/lib/anthropic";
import {
  CPT_TRANSLATION_SYSTEM_PROMPT,
  GUIDED_SEARCH_SYSTEM_PROMPT,
  buildTranslationPrompt,
  buildGuidedSearchPrompt,
  buildClarificationPrompt,
} from "./prompts";
import { normalizePricingPlanInput } from "./pricing-plan";
import {
  extractLaterality,
  extractBodySite,
} from "./body-site-laterality-constants";
import type {
  BodySite,
  CPTCode,
  BillingCodeType,
  ClarificationTurn,
  Laterality,
  PricingPlan,
  QueryType,
  TranslationResponse,
} from "@/types";

interface TranslationResult {
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
  queryType?: QueryType;
  pricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
}

const WITH_AND_WITHOUT_CONTRAST_REGEX =
  /\b(with and without contrast|both with and without contrast|with\/without contrast|w\/wo contrast)\b/i;
const WITHOUT_CONTRAST_REGEX =
  /\b(without contrast|w\/o contrast|no contrast|non[-\s]?contrast)\b/i;
const WITH_CONTRAST_REGEX =
  /\b(with contrast|w\/\s*contrast|contrast[-\s]?enhanced)\b/i;

type ContrastPreference = "without" | "with" | "with_and_without";

interface ImagingFamily {
  codes: [string, string, string];
  trigger: RegExp;
}

const IMAGING_FAMILIES: ImagingFamily[] = [
  {
    // Lower-extremity/knee MRI family: without, with, and with+without contrast.
    codes: ["73721", "73722", "73723"],
    trigger:
      /\bmri\b.*\b(knee|lower extremity|leg|ankle|hip|joint)\b|\b(knee|lower extremity|leg|ankle|hip|joint)\b.*\bmri\b/i,
  },
  {
    codes: ["70551", "70552", "70553"],
    trigger:
      /\bmri\b.*\b(brain|head|cranial|neuro)\b|\b(brain|head|cranial|neuro)\b.*\bmri\b/i,
  },
  {
    codes: ["70450", "70460", "70470"],
    trigger:
      /\b(ct|cat scan|computed tomography)\b.*\b(head|brain|cranial)\b|\b(head|brain|cranial)\b.*\b(ct|cat scan|computed tomography)\b/i,
  },
];

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

type RawCode = {
  code: string;
  codeType?: string;
  description: string;
  category: string;
};

function normalizeCodeType(value: unknown): BillingCodeType {
  if (value === "hcpcs" || value === "ms_drg") return value;
  return "cpt";
}

function normalizeCodeValue(code: string): string {
  return code.trim().toUpperCase();
}

function detectContrastPreference(
  query: string
): ContrastPreference | undefined {
  if (WITH_AND_WITHOUT_CONTRAST_REGEX.test(query)) return "with_and_without";
  if (WITHOUT_CONTRAST_REGEX.test(query)) return "without";
  if (WITH_CONTRAST_REGEX.test(query)) return "with";
  return undefined;
}

function extractExplicitCptCodes(query: string): string[] {
  const explicitCodeRegex = /\b(?:cpt\s*)?(\d{5})\b/gi;
  const codes = new Set<string>();
  for (const match of query.matchAll(explicitCodeRegex)) {
    if (match[1]) {
      codes.add(normalizeCodeValue(match[1]));
    }
  }
  return Array.from(codes);
}

function hasCode(
  codes: CPTCode[],
  codeType: BillingCodeType,
  codeValue: string
): boolean {
  const normalizedCode = normalizeCodeValue(codeValue);
  return codes.some(
    (code) =>
      normalizeCodeType(code.codeType) === codeType &&
      normalizeCodeValue(code.code) === normalizedCode
  );
}

function addCodeIfMissing(
  codes: CPTCode[],
  code: string,
  description: string
): CPTCode[] {
  if (hasCode(codes, "cpt", code)) return codes;
  return [
    ...codes,
    {
      code,
      codeType: "cpt",
      description,
      category: "Radiology",
    },
  ];
}

function applyExplicitCodeGuardrail(
  query: string,
  codes: CPTCode[]
): CPTCode[] {
  const explicitCodes = extractExplicitCptCodes(query);
  if (explicitCodes.length === 0) return codes;

  let nextCodes = [...codes];
  for (const explicitCode of explicitCodes) {
    if (!hasCode(nextCodes, "cpt", explicitCode)) {
      nextCodes = [
        ...nextCodes,
        {
          code: explicitCode,
          codeType: "cpt",
          description: "User-specified CPT code",
          category: "Procedure",
        },
      ];
    }
  }

  return nextCodes;
}

function applyContrastGuardrails(query: string, codes: CPTCode[]): CPTCode[] {
  const contrastPreference = detectContrastPreference(query);
  if (!contrastPreference) return codes;

  let nextCodes = [...codes];
  for (const family of IMAGING_FAMILIES) {
    const mentionsFamily =
      family.trigger.test(query) ||
      family.codes.some((candidate) => hasCode(nextCodes, "cpt", candidate));
    if (!mentionsFamily) continue;

    const [withoutContrast, withContrast, withAndWithoutContrast] =
      family.codes;
    const targetCode =
      contrastPreference === "without"
        ? withoutContrast
        : contrastPreference === "with"
          ? withContrast
          : withAndWithoutContrast;

    nextCodes = addCodeIfMissing(
      nextCodes,
      targetCode,
      "Contrast-specific imaging code inferred from query phrasing"
    );
  }

  return nextCodes;
}

function dedupeAndSortCodes(codes: CPTCode[]): CPTCode[] {
  const deduped = new Map<string, CPTCode>();

  for (const code of codes) {
    if (typeof code.code !== "string" || code.code.trim().length === 0)
      continue;
    const codeType = normalizeCodeType(code.codeType);
    const codeValue = normalizeCodeValue(code.code);
    const key = `${codeType}:${codeValue}`;

    if (!deduped.has(key)) {
      deduped.set(key, {
        ...code,
        code: codeValue,
        codeType,
        description: code.description || "",
        category: code.category || "Procedure",
      });
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const typeA = a.codeType || "cpt";
    const typeB = b.codeType || "cpt";
    if (typeA !== typeB) return typeA.localeCompare(typeB);
    return a.code.localeCompare(b.code);
  });
}

/**
 * Maps raw code objects from Claude's response to our CPTCode type.
 */
function mapCodes(rawCodes: RawCode[]): CPTCode[] {
  return rawCodes
    .filter(
      (code): code is RawCode =>
        !!code && typeof code.code === "string" && code.code.trim().length > 0
    )
    .map((code) => ({
      code: normalizeCodeValue(code.code),
      description: code.description || "",
      category: code.category || "Procedure",
      codeType: normalizeCodeType(code.codeType),
    }));
}

/**
 * Extracts and maps billing codes from Claude's parsed JSON response.
 */
function extractCodes(
  parsed: Record<string, unknown>,
  query: string
): CPTCode[] {
  const rawCodes = mapCodes((parsed.codes as RawCode[]) || []);
  const withExplicitCodes = applyExplicitCodeGuardrail(query, rawCodes);
  const withContrastGuardrails = applyContrastGuardrails(
    query,
    withExplicitCodes
  );
  return dedupeAndSortCodes(withContrastGuardrails);
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
    temperature: 0,
    system: CPT_TRANSLATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildTranslationPrompt(query) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  const parsed = parseJsonResponse(content.text);

  return {
    codes: extractCodes(parsed, query),
    interpretation: (parsed.interpretation as string) || "",
    searchTerms: (parsed.searchTerms as string) || query,
    queryType: parsed.queryType as QueryType,
    pricingPlan: normalizePricingPlanInput(parsed.pricingPlan),
    laterality: extractLaterality(parsed.laterality),
    bodySite: extractBodySite(parsed.bodySite),
  };
}

/**
 * Guided search: initial assessment of a user query.
 * Returns either high-confidence codes or the first clarifying question.
 */
export async function assessQuery(query: string): Promise<TranslationResponse> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    temperature: 0,
    system: GUIDED_SEARCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildGuidedSearchPrompt(query) }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  const parsed = parseJsonResponse(content.text);
  return buildTranslationResponse(parsed, query);
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
    temperature: 0,
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
  return buildTranslationResponse(parsed, query);
}

/**
 * Maps Claude's raw JSON response into a typed TranslationResponse.
 */
function buildTranslationResponse(
  parsed: Record<string, unknown>,
  query: string
): TranslationResponse {
  return {
    codes: extractCodes(parsed, query),
    interpretation: (parsed.interpretation as string) || "",
    searchTerms: (parsed.searchTerms as string) || undefined,
    confidence: (parsed.confidence as "high" | "low") || "low",
    queryType: parsed.queryType as TranslationResponse["queryType"],
    pricingPlan: normalizePricingPlanInput(parsed.pricingPlan),
    laterality: extractLaterality(parsed.laterality),
    bodySite: extractBodySite(parsed.bodySite),
    nextQuestion: parsed.nextQuestion as TranslationResponse["nextQuestion"],
    conversationComplete: (parsed.conversationComplete as boolean) || false,
  };
}
