/**
 * Deterministic check for words that suggest an emergency or a mental health
 * crisis. ClearCost never judges urgency; this only decides whether to show
 * the 911 / 988 notice, so it errs toward showing it.
 */

const EMERGENCY_PATTERNS = [
  /\bchest (pain|pressure|tightness)\b/,
  /\b(can'?t|cannot|trouble|hard to|difficulty) breath/,
  /\bshort(ness)? of breath\b/,
  /\bstroke\b/,
  /\bheart attack\b/,
  /\bseizure\b/,
  /\bunconscious\b/,
  /\bpassed out\b/,
  /\bfaint(ed|ing)\b/,
  /\boverdos/,
  /\bpoison(ed|ing)?\b/,
  /\banaphyla/,
  /\b(severe|heavy|uncontrolled) bleeding\b/,
  /\bbleeding (heavily|a lot|won'?t stop)\b/,
  /\bcoughing (up )?blood\b/,
  /\bvomiting blood\b/,
  /\bslurred speech\b/,
  /\bface (is )?droop/,
  /\bworst headache\b/,
  /\bsuicid/,
  /\bkill (myself|me)\b/,
  /\bend my life\b/,
  /\bself[- ]harm\b/,
  /\bhurt(ing)? myself\b/,
];

const CRISIS_PATTERNS = [
  /\bsuicid/,
  /\bkill (myself|me)\b/,
  /\bend my life\b/,
  /\bself[- ]harm\b/,
  /\bhurt(ing)? myself\b/,
  /\boverdos/,
];

export type EmergencyKind = "medical" | "crisis";

export function detectEmergency(
  ...texts: (string | null | undefined)[]
): EmergencyKind | null {
  const text = texts.filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  if (CRISIS_PATTERNS.some((p) => p.test(text))) return "crisis";
  if (EMERGENCY_PATTERNS.some((p) => p.test(text))) return "medical";
  return null;
}
