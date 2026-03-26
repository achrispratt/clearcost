"use client";

import {
  formatPrice,
  formatDistance,
  getDisplayPrice,
  displayName,
} from "@/lib/format";
import type { ChargeResult } from "@/types";

interface ResultRowProps {
  result: ChargeResult;
  rank: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect?: () => void;
  priceRange?: { min: number; max: number };
}

const ROW_GRID = "1fr 90px 100px 65px 80px 24px";

/** Returns a color based on where the price falls in the range: green (low), amber (mid), red (high) */
function priceColor(
  price: number | undefined,
  range: { min: number; max: number } | undefined
): string {
  if (!price || !range || range.max === range.min) return "var(--cc-text)";
  const ratio = (price - range.min) / (range.max - range.min);
  if (ratio <= 0.33) return "var(--cc-success)"; // green — low end
  if (ratio <= 0.66) return "var(--cc-accent)"; // amber — mid
  return "var(--cc-error)"; // red — high end
}

export function ResultRow({
  result,
  isSelected,
  isExpanded,
  onToggleExpand,
  onSelect,
  priceRange,
}: ResultRowProps) {
  const distance = formatDistance(result.distanceMiles);
  const displayPrice = getDisplayPrice(result);
  const estTotal =
    result.estimatedTotalMedian ?? result.episodeEstimate?.estimatedAllInMedian;

  const baseAmount = displayPrice.amount;
  const estAmount = estTotal ?? baseAmount;

  return (
    <div
      data-result-id={result.id}
      data-provider-id={result.provider.id}
      className="grid items-center cursor-pointer select-none transition-colors duration-100 hover:bg-[var(--cc-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cc-primary)]"
      style={{
        gridTemplateColumns: ROW_GRID,
        padding: "10px 16px",
        borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        background:
          isExpanded || isSelected ? "var(--cc-primary-light)" : undefined,
      }}
      role="row"
      aria-expanded={isExpanded}
      tabIndex={0}
      onClick={() => {
        onToggleExpand?.();
        if (!isExpanded) onSelect?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpand?.();
          if (!isExpanded) onSelect?.();
        }
      }}
    >
      {/* Provider */}
      <div role="cell" className="min-w-0">
        <div
          className="font-semibold text-[13px] truncate"
          style={{ color: "var(--cc-text)" }}
        >
          {displayName(result.provider.name)}
        </div>
        <div
          className="text-[11px]"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          {result.setting || "Outpatient"}
        </div>
      </div>

      {/* Base Price — first, normal weight */}
      <div
        role="cell"
        className="text-[13px]"
        style={{ color: priceColor(baseAmount, priceRange) }}
      >
        {formatPrice(baseAmount)}
      </div>

      {/* Est. Total — bold, color-coded */}
      <div
        role="cell"
        className="font-bold text-[15px] hidden sm:block"
        style={{ color: priceColor(estAmount, priceRange) }}
      >
        {formatPrice(estAmount)}
      </div>

      {/* Distance */}
      <div
        role="cell"
        className="text-[12px]"
        style={{ color: "var(--cc-text-tertiary)" }}
      >
        {distance}
      </div>

      {/* Quality stars — placeholder until #141 */}
      <div
        role="cell"
        className="text-[12px] hidden sm:block"
        style={{ color: "var(--cc-text-tertiary)" }}
      >
        —
      </div>

      {/* Chevron */}
      <div role="cell" className="flex justify-center">
        <svg
          className="w-3.5 h-3.5 transition-transform duration-150"
          style={{
            color: isExpanded ? "var(--cc-primary)" : "var(--cc-border-strong)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

export { ROW_GRID };
