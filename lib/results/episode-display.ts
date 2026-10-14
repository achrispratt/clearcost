import type { EpisodeConfidence, EpisodeEstimate } from "@/types";

/** Plain-language view of one hospital's all-in episode estimate. */
export interface EpisodeDisplay {
  total: number;
  low?: number;
  high?: number;
  confidence: EpisodeConfidence;
  /** Short tag shown next to the total. */
  confidenceLabel: string;
  /** What the estimate covers: the hospital's parts or the doctors'. */
  heading: string;
  /** Caveats a reader needs before trusting the number, in order. */
  notes: string[];
  /** Codes of parts this hospital has no usable price for. */
  missingCodes: string[];
}

const CONFIDENCE_LABEL: Record<EpisodeConfidence, string> = {
  high: "From published cash prices",
  medium: "Partly estimated",
  low: "Rough estimate",
};

function parts(n: number): string {
  return `${n} ${n === 1 ? "part" : "parts"}`;
}

/**
 * Turn an episode estimate into what the results page says about it.
 * Converted lines are never presented as published cash prices, and parts
 * we couldn't price are called out rather than silently left out.
 */
export function describeEpisode(
  estimate: EpisodeEstimate | undefined
): EpisodeDisplay | null {
  if (!estimate || estimate.estimatedAllInMedian == null) return null;

  const total = estimate.componentCount;
  const converted = estimate.lines.filter((l) => l.source !== "cash");
  const national = converted.some((l) => l.ratioScope === "national");
  const missing = estimate.missingCodes.length;
  const professional = estimate.billingClass === "professional";

  const notes: string[] = [];
  if (converted.length > 0) {
    const fromInsured = converted.some((l) => l.source === "insured_converted");
    const fromList = converted.some((l) => l.source === "gross_converted");
    const basis =
      fromInsured && fromList
        ? "its insured and list prices"
        : fromInsured
          ? "what insurers pay there"
          : "its list prices";
    notes.push(
      `${parts(converted.length)} of ${total} ${converted.length === 1 ? "has" : "have"} no published cash price, so we estimated ${converted.length === 1 ? "it" : "them"} from ${basis}${national ? " using national averages" : ""}.`
    );
  }
  if (missing > 0) {
    notes.push(
      `We couldn't find a price for ${parts(missing)} of ${total}, so the real total may be higher.`
    );
  }
  if (professional) {
    notes.push("Doctors' fees only. The hospital's own fee isn't included.");
  }

  return {
    total: estimate.estimatedAllInMedian,
    low: estimate.estimatedAllInMin,
    high: estimate.estimatedAllInMax,
    confidence: estimate.confidence,
    confidenceLabel: CONFIDENCE_LABEL[estimate.confidence],
    heading: professional
      ? "Est. doctors' fees, all parts"
      : "Est. hospital total, all parts",
    notes,
    missingCodes: estimate.missingCodes,
  };
}
