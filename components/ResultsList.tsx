"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import type { ChargeResult } from "@/types";
import { getDisplayPrice } from "@/lib/format";
import { ResultRow } from "./ResultRow";
import { ResultRowDetail } from "./ResultRowDetail";

interface ResultsListProps {
  results: ChargeResult[];
  loading?: boolean;
  selectedProviderId?: string | null;
  markerClickCount?: number;
  onCardSelect?: (providerId: string) => void;
  onResultClick?: () => void;
  locationDisplay?: string;
  onExpandRadius?: () => void;
}

export function ResultsList({
  results,
  loading,
  selectedProviderId,
  markerClickCount = 0,
  onCardSelect,
  onResultClick,
  locationDisplay,
  onExpandRadius,
}: ResultsListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Reset to first result when search results change
  useEffect(() => {
    setExpandedIds(
      results.length > 0 ? new Set([results[0].id]) : new Set<string>()
    );
  }, [results]);

  // Expand all cards for the selected provider on map marker clicks.
  // Uses markerClickCount (not selectedProviderId) as the trigger so card
  // clicks don't expand siblings. Other deps are read but intentionally
  // excluded — this should only fire on marker click events.
  useEffect(() => {
    if (markerClickCount === 0 || !selectedProviderId) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const r of results) {
        if (r.provider.id === selectedProviderId && !next.has(r.id)) {
          next.add(r.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerClickCount]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) =>
      prev.has(id) ? new Set<string>() : new Set([id])
    );
  }, []);

  const handleSelect = useCallback(
    (providerId: string) => {
      onCardSelect?.(providerId);
      onResultClick?.();
    },
    [onCardSelect, onResultClick]
  );

  // Compute price range for color-coding (green/amber/red)
  const priceRange = useMemo(() => {
    const prices = results
      .map((r) => {
        const dp = getDisplayPrice(r);
        return (
          r.estimatedTotalMedian ??
          r.episodeEstimate?.estimatedAllInMedian ??
          dp.amount
        );
      })
      .filter((p): p is number => p != null && p > 0);
    if (prices.length === 0) return undefined;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [results]);

  if (loading) {
    return (
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["w-16", "w-12", "w-12", "w-10", "w-10", "w-4"].map((w, i) => (
              <th
                key={i}
                className="py-1.5 px-4"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className={`h-2.5 ${w} shimmer rounded`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <tr key={i}>
              <td
                className="py-3 px-4"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className="h-3.5 w-40 shimmer rounded mb-1" />
                <div className="h-2.5 w-16 shimmer rounded" />
              </td>
              <td
                className="py-3 px-4"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className="h-4 w-14 shimmer rounded" />
              </td>
              <td
                className="py-3 px-4 hidden sm:table-cell"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className="h-4 w-16 shimmer rounded" />
              </td>
              <td
                className="py-3 px-4"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className="h-3 w-10 shimmer rounded" />
              </td>
              <td
                className="py-3 px-4 hidden sm:table-cell"
                style={{ borderBottom: "1px solid var(--cc-border)" }}
              >
                <div className="h-3 w-14 shimmer rounded" />
              </td>
              <td
                className="py-3 pr-4"
                style={{
                  borderBottom: "1px solid var(--cc-border)",
                  width: "32px",
                }}
              >
                <div className="h-3 w-3 shimmer rounded" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (results.length === 0) {
    return (
      <div
        className="text-center py-16 rounded-xl border"
        style={{
          background: "var(--cc-surface)",
          borderColor: "var(--cc-border)",
        }}
      >
        <svg
          className="w-10 h-10 mx-auto mb-3"
          style={{ color: "var(--cc-border-strong)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <path d="M8 11h6" />
        </svg>
        <p
          className="font-medium"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          No results found{locationDisplay ? ` near ${locationDisplay}` : ""}
        </p>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          Try a larger search radius or a different location.
        </p>
        {onExpandRadius && (
          <button
            onClick={onExpandRadius}
            className="mt-3 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{
              color: "var(--cc-primary)",
              background: "var(--cc-primary-light)",
            }}
          >
            Expand search area
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {results.length < 3 && (
        <div
          className="mx-4 mb-2 p-3 rounded-lg border text-sm flex items-center justify-between gap-3"
          style={{
            background: "var(--cc-accent-light)",
            borderColor: "rgba(217, 119, 6, 0.2)",
            color: "var(--cc-accent)",
          }}
        >
          <span>
            Only {results.length} result{results.length !== 1 ? "s" : ""} found.
            Try expanding your search area.
          </span>
          {onExpandRadius && (
            <button
              onClick={onExpandRadius}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: "var(--cc-accent)",
                background: "rgba(217, 119, 6, 0.12)",
              }}
            >
              Expand radius
            </button>
          )}
        </div>
      )}

      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead
          className="sticky top-0 z-10"
          style={{ background: "var(--cc-bg)" }}
        >
          <tr
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              color: "var(--cc-text-tertiary)",
            }}
          >
            <th
              className="text-left py-1.5 px-4 font-semibold"
              style={{ borderBottom: "1px solid var(--cc-border)" }}
            >
              Provider
            </th>
            <th
              className="text-right py-1.5 px-4 font-semibold"
              style={{ borderBottom: "1px solid var(--cc-border)" }}
            >
              Base Price
            </th>
            <th
              className="text-right py-1.5 px-4 font-semibold hidden sm:table-cell"
              style={{ borderBottom: "1px solid var(--cc-border)" }}
            >
              Est. Total
            </th>
            <th
              className="text-right py-1.5 px-4 font-semibold"
              style={{ borderBottom: "1px solid var(--cc-border)" }}
            >
              Distance
            </th>
            <th
              className="py-1.5 px-4 font-semibold hidden sm:table-cell"
              style={{ borderBottom: "1px solid var(--cc-border)" }}
            >
              Quality
            </th>
            <th
              style={{
                borderBottom: "1px solid var(--cc-border)",
                width: "32px",
              }}
            />
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <React.Fragment key={result.id}>
              <ResultRow
                result={result}
                isSelected={result.provider.id === selectedProviderId}
                isExpanded={expandedIds.has(result.id)}
                onToggleExpand={() => handleToggleExpand(result.id)}
                onSelect={() => handleSelect(result.provider.id)}
                priceRange={priceRange}
              />
              {expandedIds.has(result.id) && (
                <ResultRowDetail result={result} />
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
