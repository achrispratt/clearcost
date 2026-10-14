// Models the product calls, one entry per job. Change models here only.
// `params` are sent to the provider's API as-is — each model has its own
// rules (e.g. newer Claude models reject `temperature`), so update them together.
export const AI_MODELS = {
  /** Plain-English query → billing codes, including the guided-search Q&A. */
  billingCodeTranslation: {
    provider: "anthropic",
    model: "claude-haiku-5-5",
    params: { max_tokens: 2048, thinking: { type: "disabled" } },
  },
  /**
   * Query → vector for matching new phrasings to known KB queries. Runs in the
   * `embed` Supabase Edge Function (built-in model, English-only, 384 dims);
   * keep supabase/functions/embed/index.ts in sync.
   */
  queryEmbedding: {
    provider: "supabase",
    model: "gte-small",
    dimensions: 384,
  },
} as const;
