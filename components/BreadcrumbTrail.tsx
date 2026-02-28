"use client";

import type { ClarificationTurn } from "@/types";

interface BreadcrumbTrailProps {
  query: string;
  turns: ClarificationTurn[];
  loading: boolean;
  onQueryClick: () => void;
  onBreadcrumbClick: (stepIndex: number) => void;
}

export function BreadcrumbTrail({
  query,
  turns,
  loading,
  onQueryClick,
  onBreadcrumbClick,
}: BreadcrumbTrailProps) {
  if (turns.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-6 animate-fade-in">
      <button
        onClick={onQueryClick}
        disabled={loading}
        className="text-xs font-medium transition-colors hover:underline"
        style={{
          color: "var(--cc-text-tertiary)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {query}
      </button>
      {turns.map((turn, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <svg
            className="w-3 h-3"
            style={{ color: "var(--cc-text-tertiary)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <button
            onClick={() => onBreadcrumbClick(i)}
            disabled={loading}
            className="text-xs px-2 py-0.5 rounded-md transition-all hover:brightness-95"
            style={{
              background: "var(--cc-primary-light)",
              color: "var(--cc-primary)",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {turn.freeText || turn.selectedOption}
          </button>
        </span>
      ))}
    </div>
  );
}
