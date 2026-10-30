import type { AnswerState, FeeScope } from "@/lib/results/summarize";

// ============================================================================
// Snapshots taken before and after a data load or modification
// (scripts/data-check.ts, docs/data-checks.md). A snapshot holds what a
// patient would see for a fixed set of searches, plus per-hospital, per-code
// coverage for the hospitals the change touches. Comparing two snapshots shows
// what the change did. Snapshots name hospitals, so they live in the project
// folder, never in the repo.
// ============================================================================

export const SNAPSHOT_VERSION = 1;

/** One hospital in one search, as the results page would price it. */
export interface HospitalPrice {
  id: string;
  name: string;
  state?: string;
  amount: number;
  type: "cash" | "insured" | "gross";
  scope: FeeScope;
  source?: string;
}

/** One search (a procedure near a city) and its headline answer. */
export interface SearchSnapshot {
  /** `${procedure}|${metro}` */
  key: string;
  procedure: string;
  metro: string;
  /** Metro's state, for scoping a load to the states it touched. */
  state: string;
  answer: {
    state: AnswerState;
    /** Priced entries: the main range plus insured prices kept beside it. */
    rangeCount: number;
    low?: number;
    median?: number;
    high?: number;
  };
  hospitals: HospitalPrice[];
}

/**
 * Coverage of one code at one hospital:
 * [rows, priced rows, cash min, cash max, insured min, insured max].
 */
export type CodeCoverage = [
  number,
  number,
  number | null,
  number | null,
  number | null,
  number | null,
];

export interface ProviderFingerprint {
  name: string;
  state?: string;
  /** When this hospital's own price file was last loaded (cms_mrf rows). */
  lastLoaded: string | null;
  codes: Record<string, CodeCoverage>;
}

export interface Snapshot {
  version: number;
  label: string;
  takenAt: string;
  /** States the change is expected to touch; empty means none named. */
  states: string[];
  /** Fingerprint of code_price_reference, which moves the price filters. */
  referenceHash: string;
  /** National typical price per procedure, for the 10x plausibility check. */
  nationalMedians: Record<string, number>;
  searches: SearchSnapshot[];
  providers: Record<string, ProviderFingerprint>;
}

export type Severity = "fail" | "review" | "info";

export interface Finding {
  severity: Severity;
  kind: string;
  /** Search key or hospital id the finding is about. */
  key: string;
  message: string;
  /** Size of the change, for ordering (bigger first). */
  weight: number;
}
