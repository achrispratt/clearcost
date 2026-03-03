"use client";

import type { ChargeResult } from "@/types";
import { ResultCard } from "./ResultCard";

interface ResultsListProps {
  results: ChargeResult[];
  loading?: boolean;
  selectedResultId?: string | null;
  codeDescriptionMap?: Record<string, string>;
}

export function ResultsList({ results, loading, selectedResultId, codeDescriptionMap }: ResultsListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
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
              <div className="flex-1 p-4">
                {/* Header: rank + name on left, price on right */}
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg shimmer shrink-0" />
                      <div className="h-4 w-48 shimmer" />
                    </div>
                    <div className="h-3 w-64 shimmer" />
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-12 shimmer" />
                      <div className="h-3 w-40 shimmer" />
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div className="h-7 w-20 shimmer" />
                    <div className="h-3 w-14 shimmer" />
                  </div>
                </div>
                {/* Footer */}
                <div
                  className="mt-3 pt-3 flex items-center justify-between"
                  style={{ borderTop: "1px solid var(--cc-border)" }}
                >
                  <div className="h-3 w-36 shimmer" />
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-12 shimmer" />
                    <div className="h-3 w-24 shimmer" />
                  </div>
                </div>
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
        <p className="font-medium" style={{ color: "var(--cc-text-secondary)" }}>
          No results found
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--cc-text-tertiary)" }}>
          Try adjusting your search or expanding your location radius.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "var(--cc-text-tertiary)" }}>
        {results.length} result{results.length !== 1 ? "s" : ""} found
      </p>

      {results.length < 3 && (
        <div
          className="p-3 rounded-xl border text-sm"
          style={{
            background: "var(--cc-accent-light)",
            borderColor: "rgba(217, 119, 6, 0.2)",
            color: "var(--cc-accent)",
          }}
        >
          Limited pricing data available for this area. Try expanding your
          search radius or searching in a nearby metro area.
        </div>
      )}

      {results.map((result, i) => (
        <div
          key={result.id}
          className="animate-fade-up"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <ResultCard result={result} rank={i + 1} isSelected={result.id === selectedResultId} codeDescriptionMap={codeDescriptionMap} />
        </div>
      ))}
    </div>
  );
}
