import { formatPrice } from "@/lib/format";
import type { EpisodeDisplay } from "@/lib/results/episode-display";

/**
 * Slip rows for an all-in episode estimate: the total, how sure we are, and
 * what it leaves out. Render inside a `.slip`.
 */
export function EpisodeEstimateRows({
  display,
  at,
}: {
  display: EpisodeDisplay;
  /** Hospital name, when the slip covers more than one hospital. */
  at?: string;
}) {
  const { low, high } = display;
  const showRange = low != null && high != null && high - low >= 1;
  return (
    <>
      <div className="slip-row">
        <span>
          {display.heading}
          {at && ` at ${at}`}
          <span
            className="slip-note"
            style={
              display.confidence === "high"
                ? undefined
                : { color: "var(--cc-accent)" }
            }
          >
            {display.confidenceLabel}
          </span>
        </span>
        <span>
          {formatPrice(display.total)}
          {showRange && (
            <span className="slip-note">
              {formatPrice(low)} – {formatPrice(high)}
            </span>
          )}
        </span>
      </div>
      {display.notes.length > 0 && (
        <ul
          className="pt-1.5 pb-1 space-y-1 text-[12px] leading-relaxed"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          {display.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {display.missingCodes.length > 0 && (
            <li style={{ color: "var(--cc-text-tertiary)" }}>
              Not priced:{" "}
              <span className="code">{display.missingCodes.join(", ")}</span>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
