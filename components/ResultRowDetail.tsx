"use client";

import { formatPrice, getDisplayPrice, notNull } from "@/lib/format";
import type { ChargeResult } from "@/types";

interface ResultRowDetailProps {
  result: ChargeResult;
}

export function ResultRowDetail({ result }: ResultRowDetailProps) {
  const displayPrice = getDisplayPrice(result);
  const estTotal =
    result.estimatedTotalMedian ?? result.episodeEstimate?.estimatedAllInMedian;

  const address = [
    result.provider.address,
    result.provider.city,
    [result.provider.state, result.provider.zip].filter(notNull).join(" "),
  ]
    .filter(notNull)
    .join(", ");

  const billingClassNote =
    result.billingClass?.toLowerCase() === "facility"
      ? "Facility fee only — professional fees may apply separately"
      : result.billingClass?.toLowerCase() === "professional"
        ? "Professional fee only — facility charges may apply separately"
        : null;

  return (
    <tr>
      <td
        colSpan={6}
        style={{
          background: "var(--cc-primary-light)",
          borderBottom: "1px solid var(--cc-border)",
        }}
      >
        <div
          style={{ padding: "12px 16px" }}
          className="flex flex-col sm:flex-row gap-4"
        >
          {/* Left — fee breakdown */}
          <div className="flex-1 min-w-0">
            {address && (
              <p
                className="text-[12px] mb-2.5"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                {address}
              </p>
            )}

            <div
              className="rounded-md p-3"
              style={{
                background: "var(--cc-surface)",
                border: "1px solid var(--cc-border)",
              }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-2"
                style={{ color: "var(--cc-text-tertiary)" }}
              >
                Fee Breakdown
              </p>
              <div className="flex justify-between py-1 text-[13px]">
                <span style={{ color: "var(--cc-text-secondary)" }}>
                  {result.billingClass?.toLowerCase() === "professional"
                    ? "Professional Fee"
                    : "Facility Fee"}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--cc-text)" }}
                >
                  {formatPrice(displayPrice.amount)}
                </span>
              </div>
              {billingClassNote && (
                <div className="flex justify-between py-1 text-[13px]">
                  <span style={{ color: "var(--cc-text-secondary)" }}>
                    {result.billingClass?.toLowerCase() === "facility"
                      ? "Professional Fee"
                      : "Facility Fee"}
                  </span>
                  <span
                    className="text-[12px] italic"
                    style={{ color: "var(--cc-accent)" }}
                  >
                    Billed separately
                  </span>
                </div>
              )}
              {estTotal != null && estTotal !== displayPrice.amount && (
                <div
                  className="flex justify-between py-1.5 mt-1 text-[13px]"
                  style={{ borderTop: "1px solid var(--cc-border)" }}
                >
                  <span
                    className="font-semibold"
                    style={{ color: "var(--cc-text)" }}
                  >
                    Estimated Total
                  </span>
                  <span
                    className="font-bold text-[15px]"
                    style={{ color: "var(--cc-primary)" }}
                  >
                    {formatPrice(estTotal)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right — meta + CTA */}
          <div className="flex flex-col gap-2 justify-between sm:min-w-[170px]">
            {result.medicareFacilityRate != null && (
              <div className="text-[12px]">
                <span style={{ color: "var(--cc-text-tertiary)" }}>
                  Medicare:{" "}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--cc-success)" }}
                >
                  {formatPrice(result.medicareFacilityRate)}
                </span>
                {result.medicareMultiplier != null &&
                  result.medicareMultiplier > 1 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1"
                      style={{
                        background: "var(--cc-accent-light)",
                        color: "var(--cc-accent)",
                      }}
                    >
                      {result.medicareMultiplier}×
                    </span>
                  )}
              </div>
            )}
            {result.avgNegotiatedRate != null && (
              <div className="text-[12px]">
                <span style={{ color: "var(--cc-text-tertiary)" }}>
                  Avg Insured:{" "}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--cc-info)" }}
                >
                  {formatPrice(result.avgNegotiatedRate)}
                </span>
                {result.payerCount != null && result.payerCount > 0 && (
                  <span style={{ color: "var(--cc-text-tertiary)" }}>
                    {" "}
                    ({result.payerCount} payers)
                  </span>
                )}
              </div>
            )}
            <button
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors mt-auto"
              style={{
                background: "var(--cc-surface)",
                border: "1px solid var(--cc-primary)",
                color: "var(--cc-primary)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Placeholder — hospital profile page not yet built
              }}
              title="Coming soon"
            >
              View Hospital Profile →
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
