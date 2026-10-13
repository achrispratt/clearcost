import type { ClarificationTurn } from "@/types";

// Server-side caps for unauthenticated routes that can trigger Claude calls.
// Generous relative to real UI usage (queries are a few words; the prompt asks
// Claude to resolve within 6 turns; the UI's largest radius is 250 miles),
// but they stop scripted requests from inflating per-call cost.
export const MAX_QUERY_CHARS = 500;
export const MAX_TURNS = 10;
const MAX_QUESTION_ID_CHARS = 100;
const MAX_OPTION_CHARS = 200;
const MAX_FREE_TEXT_CHARS = 500;
export const MAX_RADIUS_MILES = 250;

/** Returns an error message if the query is unusable, otherwise null. */
export function validateQuery(query: unknown): string | null {
  if (typeof query !== "string" || !query.trim()) return "Query is required";
  if (query.length > MAX_QUERY_CHARS) {
    return `Query must be ${MAX_QUERY_CHARS} characters or fewer`;
  }
  return null;
}

/** Returns an error message if the turns array is malformed or oversized, otherwise null. */
export function validateTurns(turns: unknown): string | null {
  if (!Array.isArray(turns)) return "Turns must be an array";
  if (turns.length > MAX_TURNS) return `At most ${MAX_TURNS} turns allowed`;

  const valid = turns.every((turn): turn is ClarificationTurn => {
    if (!turn || typeof turn !== "object") return false;
    const { questionId, selectedOption, freeText } = turn as Record<
      string,
      unknown
    >;
    return (
      typeof questionId === "string" &&
      questionId.length <= MAX_QUESTION_ID_CHARS &&
      typeof selectedOption === "string" &&
      selectedOption.length <= MAX_OPTION_CHARS &&
      (freeText === undefined ||
        (typeof freeText === "string" &&
          freeText.length <= MAX_FREE_TEXT_CHARS))
    );
  });
  return valid ? null : "Invalid turns";
}
