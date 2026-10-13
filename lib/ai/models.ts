/**
 * Runtime AI models — the models the ClearCost product calls to do its work.
 *
 * This is the single place model choices live. Each entry is one job the
 * product needs done; code uses the job name, never a model ID. To change or
 * upgrade a model, edit the entry here, check the new model's API rules
 * against the settings below (providers sometimes reject parameters on newer
 * models), and verify output quality before merging.
 *
 * Add a new entry when a new job needs a model, even if it reuses the same
 * model as an existing job — that keeps each job independently changeable.
 *
 * (Not to be confused with the AI coding agents that work on this repo —
 * those are configured in AGENTS.md / CLAUDE.md, not here.)
 */
export const AI_MODELS = {
  /** Plain-English query → billing codes, including the guided-search Q&A. */
  billingCodeTranslation: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    maxTokens: 1024,
    temperature: 0,
  },
} as const;
