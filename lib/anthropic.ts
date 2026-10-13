import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to your .env.local file."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Settings shared by every Claude call. Switching models happens here (or via
// the CLAUDE_MODEL env var); review all three fields together, since newer
// models may reject some (e.g. Sonnet 5.5 rejects non-default temperature).
export const CLAUDE_REQUEST_DEFAULTS = {
  model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
  max_tokens: 1024,
  temperature: 0,
};
