/**
 * Compare candidate models against the current billingCodeTranslation model
 * (lib/ai/models.ts) on a fixed set of real-world queries. Run before any model
 * change. Costs real API money (a few cents per candidate).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/compare-ai-models.ts \
 *     <model-id>[=<params JSON>] [...more candidates]
 *
 * Params JSON is sent to the API as-is (defaults to {"max_tokens":1024}), e.g.
 *   <model-id>='{"max_tokens":1024,"thinking":{"type":"disabled"}}'
 *
 * Writes a markdown report to docs/scratchpad/.
 */
import fs from "fs";
import { AI_MODELS } from "@/lib/ai/models";
import {
  assessQuery,
  translateQueryToCPT,
  type ModelConfig,
} from "@/lib/cpt/translate";

const QUERIES = [
  "knee mri",
  "colonoscopy",
  "wrist x-ray after a fall",
  "ct scan of the abdomen with contrast",
  "mammogram",
  "complete blood count",
  "lipid panel",
  "physical therapy evaluation",
  "cataract surgery",
  "tonsillectomy for my child",
  "chest pain emergency room visit",
  "sleep study",
  "hip replacement",
  "ultrasound during pregnancy",
  "annual checkup with my doctor",
];

type Run = {
  codes: string[];
  ms: number;
  error?: string;
  guidedOk: boolean;
};

function parseCandidate(arg: string): { label: string; config: ModelConfig } {
  const [model, json] = arg.split(/=(.*)/s);
  const params = json ? JSON.parse(json) : { max_tokens: 1024 };
  return { label: model, config: { model, params } };
}

async function runOne(query: string, config: ModelConfig): Promise<Run> {
  const start = Date.now();
  try {
    const result = await translateQueryToCPT(query, config);
    const ms = Date.now() - start;
    let guidedOk = true;
    try {
      await assessQuery(query, undefined, config);
    } catch {
      guidedOk = false;
    }
    return { codes: result.codes.map((c) => c.code).sort(), ms, guidedOk };
  } catch (err) {
    return {
      codes: [],
      ms: Date.now() - start,
      error: (err as Error).message,
      guidedOk: false,
    };
  }
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const shared = a.filter((code) => b.includes(code)).length;
  return shared / new Set([...a, ...b]).size;
}

async function main() {
  const candidates = process.argv.slice(2).map(parseCandidate);
  if (candidates.length === 0) {
    console.error("Pass at least one candidate model ID. See file header.");
    process.exit(1);
  }

  const baseline = {
    label: `${AI_MODELS.billingCodeTranslation.model} (current)`,
    config: AI_MODELS.billingCodeTranslation as ModelConfig,
  };
  const all = [baseline, ...candidates];
  const results: Record<string, Run[]> = {};

  for (const { label, config } of all) {
    console.log(`Running ${label}...`);
    results[label] = [];
    for (const query of QUERIES) {
      results[label].push(await runOne(query, config));
    }
  }

  const lines = [
    `# AI model comparison — ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Code overlap = shared codes / all codes vs. the current model (1.00 = identical).",
    "",
    "## Summary",
    "",
    "| Model | Errors | Guided-search OK | Avg code overlap | Avg latency |",
    "|---|---|---|---|---|",
  ];
  for (const { label } of all) {
    const runs = results[label];
    const errors = runs.filter((r) => r.error).length;
    const guided = runs.filter((r) => r.guidedOk).length;
    const avgOverlap =
      runs.reduce(
        (sum, r, i) => sum + overlap(r.codes, results[baseline.label][i].codes),
        0
      ) / runs.length;
    const avgMs = runs.reduce((sum, r) => sum + r.ms, 0) / runs.length;
    lines.push(
      `| ${label} | ${errors} | ${guided}/${runs.length} | ${avgOverlap.toFixed(2)} | ${(avgMs / 1000).toFixed(1)}s |`
    );
  }

  lines.push(
    "",
    "## Codes by query",
    "",
    `| Query | ${all.map((c) => c.label).join(" | ")} |`
  );
  lines.push(`|---|${all.map(() => "---").join("|")}|`);
  QUERIES.forEach((query, i) => {
    const cells = all.map(({ label }) => {
      const run = results[label][i];
      return run.error
        ? `ERROR: ${run.error}`
        : run.codes.join(", ") || "(none)";
    });
    lines.push(`| ${query} | ${cells.join(" | ")} |`);
  });

  const out = `docs/scratchpad/${new Date().toISOString().slice(0, 10)}-ai-model-comparison.md`;
  fs.writeFileSync(out, lines.join("\n") + "\n");
  console.log(lines.slice(4, 8 + all.length).join("\n"));
  console.log(`\nFull report: ${out}`);
}

main();
