"use client";

import { useState, useCallback } from "react";
import type { ChargeResult } from "@/types";
import { ResultCard } from "./ResultCard";

interface ResultsListProps {
  results: ChargeResult[];
  loading?: boolean;
  selectedResultId?: string | null;
  codeDescriptionMap?: Record<string, string>;
  locationDisplay?: string;
  onExpandRadius?: () => void;
}

export function ResultsList({
  results,
  loading,
  selectedResultId,
  codeDescriptionMap,
  locationDisplay,
  onExpandRadius,
}: ResultsListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Auto-expand first result on new results, and selected card on marker click
  const [prevResults, setPrevResults] = useState(results);
  const [prevSelectedId, setPrevSelectedId] = useState(selectedResultId);
  if (results !== prevResults || selectedResultId !== prevSelectedId) {
    setPrevResults(results);
    setPrevSelectedId(selectedResultId);
    const next =
      results !== prevResults
        ? results.length > 0
          ? new Set([results[0].id])
          : new Set<string>()
        : new Set(expandedIds);
    if (selectedResultId && !next.has(selectedResultId)) {
      next.add(selectedResultId);
    }
    setExpandedIds(next);
  }

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="rounded-xl border overflow-hidden"
            style={{
              background: "var(--cc-surface)",
              borderColor: "var(--cc-border)",
            }}
          >
            <div className="flex">
              <div className="w-1 shrink-0 shimmer" />
              <div className="flex-1 flex items-center gap-2 px-3 py-2">
                <div className="w-5 h-5 rounded-lg shimmer shrink-0" />
                <div className="h-4 w-40 shimmer" />
                <div className="flex-1" />
                <div className="h-4 w-16 shimmer shrink-0" />
                <div className="h-3 w-12 shimmer shrink-0 hidden sm:block" />
                <div className="w-4 h-4 shimmer shrink-0 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
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
    <div className="space-y-1.5">
      <p className="text-sm" style={{ color: "var(--cc-text-tertiary)" }}>
        {results.length} result{results.length !== 1 ? "s" : ""} found
      </p>

      {results.length < 3 && (
        <div
          className="p-3 rounded-xl border text-sm flex items-center justify-between gap-3"
          style={{
            background: "var(--cc-accent-light)",
            borderColor: "rgba(217, 119, 6, 0.2)",
            color: "var(--cc-accent)",
          }}
        >
          <span>
            Only {results.length} result{results.length !== 1 ? "s" : ""} found
            within your search radius. Try expanding your search area for more
            options.
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

      {results.map((result, i) => (
        <div
          key={result.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
        >
          <ResultCard
            result={result}
            rank={i + 1}
            isSelected={result.id === selectedResultId}
            isExpanded={expandedIds.has(result.id)}
            onToggleExpand={() => handleToggleExpand(result.id)}
            codeDescriptionMap={codeDescriptionMap}
          />
        </div>
      ))}
    </div>
  );
}
