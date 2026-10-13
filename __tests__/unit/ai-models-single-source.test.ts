import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Runtime AI model IDs must only be defined in lib/ai/models.ts so a model
// change is a single edit. This flags quoted strings that look like a model ID
// from any major provider. Extend PROVIDER_PREFIXES if the product adopts one
// not listed here.
const SOURCE_OF_TRUTH = path.join("lib", "ai", "models.ts");
const SCANNED_DIRS = ["app", "lib", "components", "scripts"];
const PROVIDER_PREFIXES = [
  "claude",
  "gpt",
  "gemini",
  "llama",
  "mistral",
  "grok",
  "deepseek",
];
const MODEL_ID = new RegExp(
  `["'\`](?:${PROVIDER_PREFIXES.join("|")})-[\\w.-]*\\d[\\w.-]*["'\`]`,
  "i"
);

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

describe("runtime AI model IDs", () => {
  it(`are only defined in ${SOURCE_OF_TRUTH}`, () => {
    const offenders = SCANNED_DIRS.flatMap(sourceFiles)
      .filter((file) => file !== SOURCE_OF_TRUTH)
      .filter((file) => MODEL_ID.test(fs.readFileSync(file, "utf8")));

    expect(
      offenders,
      `Move these model IDs into ${SOURCE_OF_TRUTH} and reference AI_MODELS instead`
    ).toEqual([]);
  });

  it("detects a hard-coded model ID (guard self-check)", () => {
    expect(MODEL_ID.test('model: "claude-sonnet-4-5-20250929"')).toBe(true);
    expect(MODEL_ID.test('model: "gpt-4o-mini"')).toBe(true);
    expect(MODEL_ID.test('import x from "@anthropic-ai/sdk"')).toBe(false);
  });
});
