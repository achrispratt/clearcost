// Models the product calls, one entry per job. Change models here only;
// newer models may reject some settings, so check them together.
export const AI_MODELS = {
  /** Plain-English query → billing codes, including the guided-search Q&A. */
  billingCodeTranslation: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    maxTokens: 1024,
    temperature: 0,
  },
} as const;
