"use client";

import type { ChargeResult } from "@/types";

interface ResultCardProps {
  result: ChargeResult;
  rank: number;
  isSelected?: boolean;
}

function formatPrice(price: number | undefined): string {
  if (price == null) return "N/A";
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDistance(miles: number | undefined): string {
  if (miles == null) return "";
  return `${miles.toFixed(1)} mi`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function formatBillingCode(result: ChargeResult): string {
  if (result.cpt) return `CPT ${result.cpt}`;
  if (result.hcpcs) return `HCPCS ${result.hcpcs}`;
  if (result.msDrg) return `MS-DRG ${result.msDrg}`;
  return "";
}

export function ResultCard({ result, rank, isSelected }: ResultCardProps) {
  const billingCode = formatBillingCode(result);
  const distance = formatDistance(result.distanceMiles);
  const lastUpdated = formatDate(result.lastUpdated);
  const address = [
    result.provider.address,
    result.provider.city,
    [result.provider.state, result.provider.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-result-id={result.id}
      className="card-hover rounded-xl border overflow-hidden transition-all duration-300"
      style={{
        background: isSelected ? "var(--cc-primary-light)" : "var(--cc-surface)",
        borderColor: isSelected ? "var(--cc-primary)" : "var(--cc-border)",
        boxShadow: isSelected ? "0 0 0 2px var(--cc-primary)" : undefined,
      }}
    >
      <div className="flex">
        {/* Left accent stripe */}
        <div
          className="w-1 shrink-0"
          style={{
            background: rank <= 3
              ? "var(--cc-primary)"
              : "var(--cc-border-strong)",
          }}
        />

        {/* Card content */}
        <div className="flex-1 p-4">
          {/* Header row */}
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-semibold shrink-0"
                  style={{
                    background: rank <= 3 ? "var(--cc-primary-light)" : "var(--cc-surface-alt)",
                    color: rank <= 3 ? "var(--cc-primary)" : "var(--cc-text-tertiary)",
                  }}
                >
                  {rank}
                </span>
                <h3
                  className="font-semibold text-base truncate"
                  style={{ color: "var(--cc-text)" }}
                >
                  {result.provider.name}
                </h3>
                {result.setting && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
                    style={{
                      background: "var(--cc-surface-alt)",
                      color: "var(--cc-text-tertiary)",
                    }}
                  >
                    {result.setting}
                  </span>
                )}
              </div>

              {address && (
                <p
                  className="text-sm mt-1 truncate"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {address}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {billingCode && (
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                    }}
                  >
                    {billingCode}
                  </span>
                )}
                {result.description && (
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    {result.description}
                  </span>
                )}
              </div>
            </div>

            {/* Price column */}
            <div className="text-right shrink-0">
              {result.cashPrice != null ? (
                <>
                  {result.grossCharge != null && result.grossCharge > (result.cashPrice || 0) && (
                    <p
                      className="text-xs line-through"
                      style={{ color: "var(--cc-text-tertiary)" }}
                    >
                      {formatPrice(result.grossCharge)}
                    </p>
                  )}
                  <p
                    className="text-2xl font-bold"
                    style={{ color: "var(--cc-primary)" }}
                  >
                    {formatPrice(result.cashPrice)}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    Cash price
                  </p>
                </>
              ) : (
                <p
                  className="text-sm"
                  style={{ color: "var(--cc-text-tertiary)" }}
                >
                  Price unavailable
                </p>
              )}

              {result.minPrice != null && result.maxPrice != null && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--cc-text-tertiary)" }}
                >
                  {formatPrice(result.minPrice)} &ndash; {formatPrice(result.maxPrice)}
                </p>
              )}
            </div>
          </div>

          {/* Footer row */}
          <div
            className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2"
            style={{ borderTop: "1px solid var(--cc-border)" }}
          >
            <div className="flex items-center gap-4">
              {result.avgNegotiatedRate != null && (
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    Avg insured:
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--cc-info)" }}
                  >
                    {formatPrice(result.avgNegotiatedRate)}
                  </span>
                  {result.payerCount != null && result.payerCount > 0 && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--cc-text-tertiary)" }}
                    >
                      ({result.payerCount} payer{result.payerCount !== 1 ? "s" : ""})
                    </span>
                  )}
                </div>
              )}
            </div>

            <div
              className="flex items-center gap-3 text-xs"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              {distance && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {distance}
                </span>
              )}
              {result.provider.phone && (
                <a
                  href={`tel:${result.provider.phone}`}
                  className="hover:underline"
                  style={{ color: "var(--cc-primary)" }}
                >
                  {result.provider.phone}
                </a>
              )}
            </div>
          </div>

          {/* Data source row */}
          <div
            className="flex items-center gap-2 mt-2 text-xs"
            style={{ color: "var(--cc-border-strong)" }}
          >
            {lastUpdated && <span>Updated {lastUpdated}</span>}
            <span>Source: Hospital MRF</span>
          </div>
        </div>
      </div>
    </div>
  );
}
