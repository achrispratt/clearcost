import { createHash } from "crypto";
import type { ClarificationTurn } from "@/types";

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computeQueryHash(query: string): {
  normalizedQuery: string;
  queryHash: string;
} {
  const normalizedQuery = normalizeQuery(query);
  return { normalizedQuery, queryHash: sha256(normalizedQuery) };
}

export function turnToSegment(turn: ClarificationTurn): string | null {
  if (turn.selectedOption === "other" && turn.freeText) {
    return null;
  }
  return turn.selectedOption.toLowerCase().trim();
}

export function buildPathHash(
  canonicalQuery: string,
  turns: ClarificationTurn[]
): string | null {
  const segments: string[] = [];
  for (const turn of turns) {
    const segment = turnToSegment(turn);
    if (segment === null) return null;
    segments.push(segment);
  }
  const pathString = canonicalQuery + "|" + segments.join("|");
  return sha256(pathString);
}

export function buildPathHashFromSegments(
  canonicalQuery: string,
  answerSegments: string[]
): string {
  const pathString = canonicalQuery + "|" + answerSegments.join("|");
  return sha256(pathString);
}
