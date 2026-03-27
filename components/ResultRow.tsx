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
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect?: () => void;
  priceRange?: { min: number; max: number };
}

/** Returns a color based on where the price falls in the range: green (low), amber (mid), red (high) */
function priceColor(
  price: number | undefined,
  range: { min: number; max: number } | undefined
): string {
  if (!price || !range || range.max === range.min) return "var(--cc-text)";
  const ratio = (price - range.min) / (range.max - range.min);
  if (ratio <= 0.33) return "var(--cc-success)";
  if (ratio <= 0.66) return "var(--cc-accent)";
  return "var(--cc-error)";
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
    <tr
      data-result-id={result.id}
      data-provider-id={result.provider.id}
      className="cursor-pointer select-none transition-colors duration-100 hover:bg-[var(--cc-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cc-primary)]"
      style={{
        background:
          isExpanded || isSelected ? "var(--cc-primary-light)" : undefined,
      }}
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
      <td
        className="py-2.5 px-4"
        style={{
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        }}
      >
        <div
          className="font-semibold text-[13px] truncate max-w-[300px]"
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
      </td>

      {/* Base Price */}
      <td
        className="py-2.5 px-4 text-right tabular-nums text-[13px]"
        style={{
          color: priceColor(baseAmount, priceRange),
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        }}
      >
        {formatPrice(baseAmount)}
      </td>

      {/* Est. Total */}
      <td
        className="py-2.5 px-4 text-right tabular-nums font-bold text-[15px] hidden sm:table-cell"
        style={{
          color: priceColor(estAmount, priceRange),
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        }}
      >
        {formatPrice(estAmount)}
      </td>

      {/* Distance */}
      <td
        className="py-2.5 px-4 text-right text-[12px]"
        style={{
          color: "var(--cc-text-tertiary)",
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        }}
      >
        {distance}
      </td>

      {/* Quality */}
      <td
        className="py-2.5 px-4 text-[12px] hidden sm:table-cell"
        style={{
          color: "var(--cc-text-tertiary)",
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        }}
      >
        —
      </td>

      {/* Chevron */}
      <td
        className="py-2.5 pr-4 text-center"
        style={{
          borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
          width: "32px",
        }}
      >
        <svg
          className="w-3.5 h-3.5 transition-transform duration-150 inline-block"
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
      </td>
    </tr>
  );
}
