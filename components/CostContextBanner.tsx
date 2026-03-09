"use client";

import { useState, useMemo } from "react";
import { getCostContext } from "@/lib/cost-context";
import { formatPrice } from "@/lib/format";
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

        <div className="flex-1">
          <p className="text-sm" style={{ color: "var(--cc-accent)" }}>
            {context.message}
          </p>

          {context.estimates.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {context.estimates.map((e) => (
                <p
                  key={e.label}
                  className="text-sm"
                  style={{ color: "var(--cc-accent)" }}
                >
                  <span className="opacity-60">•</span> {e.label}:{" "}
                  <span className="font-semibold">
                    {e.low === e.high
                      ? formatPrice(e.low)
                      : `${formatPrice(e.low)}–${formatPrice(e.high)}`}
                  </span>
                </p>
              ))}
            </div>
          )}

          {context.footnote && (
            <p
              className="text-xs mt-1.5 opacity-75"
              style={{ color: "var(--cc-accent)" }}
            >
              {context.footnote}
            </p>
          )}
        </div>

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
