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
}

const ROW_GRID = "1fr 90px 90px 65px 80px 24px";

export function ResultRow({
  result,
  isSelected,
  isExpanded,
  onToggleExpand,
  onSelect,
}: ResultRowProps) {
  const distance = formatDistance(result.distanceMiles);
  const displayPrice = getDisplayPrice(result);
  const estTotal =
    result.estimatedTotalMedian ?? result.episodeEstimate?.estimatedAllInMedian;

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
      <div role="cell">
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

      {/* Est. Total — primary number */}
      <div
        role="cell"
        className="font-bold text-[15px] hidden sm:block"
        style={{ color: "var(--cc-primary)" }}
      >
        {estTotal ? formatPrice(estTotal) : formatPrice(displayPrice.amount)}
      </div>

      {/* Base Price — secondary */}
      <div
        role="cell"
        className="text-[13px] font-bold sm:font-normal"
        style={{
          color: isExpanded ? "var(--cc-primary)" : "var(--cc-text-secondary)",
        }}
      >
        {formatPrice(displayPrice.amount)}
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
