"use client";

import { useState, useMemo } from "react";
import { getCostContext } from "@/lib/cost-context";
import type { CPTCode, ChargeResult } from "@/types";

interface CostContextBannerProps {
  cptCodes: CPTCode[];
  results: ChargeResult[];
}

export function CostContextBanner({
  cptCodes,
  results,
}: CostContextBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const context = useMemo(
    () => getCostContext(cptCodes, results),
    [cptCodes, results]
  );

  if (dismissed || !context) return null;

  return (
    <div
      className="mt-4 rounded-xl border p-4 animate-fade-in"
      style={{
        background: "var(--cc-accent-light)",
        borderColor: "rgba(217, 119, 6, 0.15)",
      }}
    >
      <div className="flex items-start gap-2.5">
        {/* Info icon — matches ResultCard billing_class callout */}
        <svg
          className="w-4 h-4 mt-0.5 shrink-0"
          style={{ color: "var(--cc-accent)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>

        <p className="flex-1 text-sm" style={{ color: "var(--cc-accent)" }}>
          {context.message}
        </p>

        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-0.5 rounded-md hover:bg-black/5 transition-colors"
          style={{ color: "var(--cc-accent)" }}
          aria-label="Dismiss cost context"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
