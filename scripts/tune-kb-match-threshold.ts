/**
 * Prints gte-small cosine similarity for query pairs that should and should
 * not match, to pick MATCH_THRESHOLD in lib/kb/semantic.ts (#164). The
 * threshold must sit above every "should not match" pair.
 *
 * Needs the `embed` Edge Function deployed.
 * Run: npx tsx --env-file=.env.local scripts/tune-kb-match-threshold.ts
 */
import { embedText, MATCH_THRESHOLD } from "@/lib/kb/semantic";

// [query, known canonical, should match?]
const PAIRS: [string, string, boolean][] = [
  ["MRI of my knee", "knee mri", true],
  ["I need an MRI on my knee", "knee mri", true],
  ["brain mri", "mri of the brain", true],
  ["xray of my chest", "chest x-ray", true],
  ["colonoscopy", "colonoscopy screening", true],
  ["CT of my head", "head ct scan", true],
  ["knee pain", "knee mri", false],
  ["knee x-ray", "knee mri", false],
  ["shoulder mri", "knee mri", false],
  ["hip mri", "hip replacement", false],
  ["chest ct", "chest x-ray", false],
  ["upper endoscopy", "colonoscopy screening", false],
  ["breast ultrasound", "mammogram", false],
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}

async function main() {
  let minMatch = 1;
  let maxNonMatch = 0;

  for (const [query, canonical, shouldMatch] of PAIRS) {
    const [a, b] = await Promise.all([embedText(query), embedText(canonical)]);
    if (!a || !b) {
      console.error(`Embedding failed for "${query}" / "${canonical}"`);
      process.exit(1);
    }
    const sim = cosine(a, b);
    if (shouldMatch) minMatch = Math.min(minMatch, sim);
    else maxNonMatch = Math.max(maxNonMatch, sim);
    const verdict = sim >= MATCH_THRESHOLD ? "match" : "miss";
    const ok = sim >= MATCH_THRESHOLD === shouldMatch ? "✓" : "✗";
    console.log(
      `${ok} ${sim.toFixed(4)} ${verdict.padEnd(5)} "${query}" ~ "${canonical}"`
    );
  }

  console.log(
    `\nShould-match min: ${minMatch.toFixed(4)} · should-not max: ${maxNonMatch.toFixed(4)} · current threshold: ${MATCH_THRESHOLD}`
  );
}

main();
