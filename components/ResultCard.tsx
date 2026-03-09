"use client";

import {
  formatPrice,
  formatDistance,
  formatDate,
  formatBillingCode,
  getDisplayPrice,
  formatDisplayPrice,
} from "@/lib/format";
import type { ChargeResult } from "@/types";

interface ResultCardProps {
  result: ChargeResult;
  rank: number;
  isSelected?: boolean;
  codeDescriptionMap?: Record<string, string>;
}

function formatAdderPriceRange(
  result: NonNullable<ChargeResult["optionalAdders"]>[number]
): string {
  if (
    result.minPrice != null &&
    result.maxPrice != null &&
    result.minPrice !== result.maxPrice
  ) {
    return `${formatPrice(result.minPrice)} - ${formatPrice(result.maxPrice)}`;
  }

  if (result.estimatePrice != null) {
    return formatPrice(result.estimatePrice);
  }

  return "N/A";
}

export function ResultCard({
  result,
  rank,
  isSelected,
  codeDescriptionMap,
}: ResultCardProps) {
  const billingCode = formatBillingCode(result);
  const distance = formatDistance(result.distanceMiles);
  const lastUpdated = formatDate(result.lastUpdated);
  const displayPrice = getDisplayPrice(result);

  const resultCode = result.cpt || result.hcpcs || result.msDrg;
  const canonicalDescription = resultCode
    ? codeDescriptionMap?.[resultCode]
    : undefined;
  const displayDescription = canonicalDescription || result.description;
  const rawTooltip =
    canonicalDescription && result.description ? result.description : undefined;
  const address = [
    result.provider.address,
    result.provider.city,
    [result.provider.state, result.provider.zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const billingClassCallout = (() => {
    const bc = result.billingClass?.toLowerCase();
    if (bc === "facility")
      return "Facility fee only — professional fees may apply separately";
    if (bc === "professional")
      return "Professional fee only — facility charges may apply separately";
    return null;
  })();

  return (
    <div
      data-result-id={result.id}
      className="card-hover rounded-xl border overflow-hidden transition-all duration-300"
      style={{
        background: isSelected
          ? "var(--cc-primary-light)"
          : "var(--cc-surface)",
        borderColor: isSelected ? "var(--cc-primary)" : "var(--cc-border)",
        boxShadow: isSelected ? "0 0 0 2px var(--cc-primary)" : undefined,
      }}
    >
      <div className="flex">
        {/* Left accent stripe */}
        <div
          className="w-1 shrink-0"
          style={{
            background:
              rank <= 3 ? "var(--cc-primary)" : "var(--cc-border-strong)",
          }}
        />

        {/* Card content */}
        <div className="flex-1 p-4">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-semibold shrink-0"
                  style={{
                    background:
                      rank <= 3
                        ? "var(--cc-primary-light)"
                        : "var(--cc-surface-alt)",
                    color:
                      rank <= 3
                        ? "var(--cc-primary)"
                        : "var(--cc-text-tertiary)",
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
                {displayDescription && (
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--cc-text-tertiary)" }}
                    title={rawTooltip}
                  >
                    {displayDescription}
                  </span>
                )}
              </div>
            </div>

            {/* Price column */}
            <div className="text-left sm:text-right sm:shrink-0">
              {displayPrice.type === "cash" ? (
                <>
                  {result.grossCharge != null &&
                    result.grossCharge > (result.cashPrice || 0) && (
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
                    {formatDisplayPrice(displayPrice)}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    {displayPrice.label}
                  </p>
                  {result.baseSource === "local_fallback" && (
                    <p
                      className="text-[11px] mt-1"
                      style={{ color: "var(--cc-text-tertiary)" }}
                    >
                      Local estimate fallback
                    </p>
                  )}
                </>
              ) : displayPrice.type === "insured" ? (
                <>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: "var(--cc-info)" }}
                  >
                    {formatDisplayPrice(displayPrice)}
                    <span
                      className="inline-block ml-1 align-middle cursor-help"
                      title="Average rate negotiated between this hospital and insurers. Your actual cost depends on your specific plan."
                    >
                      <svg
                        className="w-4 h-4 inline"
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
                    </span>
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    {displayPrice.label}
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

              {displayPrice.type === "cash" &&
                result.minPrice != null &&
                result.maxPrice != null && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    {formatPrice(result.minPrice)} &ndash;{" "}
                    {formatPrice(result.maxPrice)}
                  </p>
                )}
              {result.estimatedTotalMedian != null && (
                <p
                  className="text-xs mt-1.5"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Est. total: {formatPrice(result.estimatedTotalMedian)}
                </p>
              )}
            </div>
          </div>

          {/* Billing class callout */}
          {billingClassCallout && (
            <div
              className="flex items-start gap-1.5 mt-2"
              style={{ color: "var(--cc-accent)" }}
            >
              <svg
                className="w-3.5 h-3.5 shrink-0 mt-0.5"
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
              <span className="text-xs">{billingClassCallout}</span>
            </div>
          )}

          {/* Footer row */}
          <div
            className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2"
            style={{ borderTop: "1px solid var(--cc-border)" }}
          >
            <div className="flex items-center gap-4">
              {displayPrice.type !== "insured" &&
                result.avgNegotiatedRate != null && (
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
                        ({result.payerCount} payer
                        {result.payerCount !== 1 ? "s" : ""})
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

          {result.optionalAdders && result.optionalAdders.length > 0 && (
            <div
              className="mt-3 p-3 rounded-lg border"
              style={{
                background: "var(--cc-surface-alt)",
                borderColor: "var(--cc-border)",
              }}
            >
              <p
                className="text-xs font-semibold"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Possible additional costs (only if ordered during visit)
              </p>
              <div className="mt-2 space-y-1.5">
                {result.optionalAdders.map((adder) => (
                  <div
                    key={`${adder.id || adder.type}-${adder.label}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--cc-text)" }}
                      >
                        {adder.label}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--cc-text-tertiary)" }}
                      >
                        {adder.source === "facility"
                          ? "this facility"
                          : "local estimate"}
                      </span>
                    </div>
                    <span
                      className="text-xs font-semibold shrink-0"
                      style={{ color: "var(--cc-primary)" }}
                    >
                      {formatAdderPriceRange(adder)}
                    </span>
                  </div>
                ))}
              </div>
              <p
                className="text-[11px] mt-2"
                style={{ color: "var(--cc-text-tertiary)" }}
              >
                Adders are separate from the base visit estimate.
              </p>
              {result.proxyLabel && (
                <p
                  className="text-[11px] mt-1"
                  style={{ color: "var(--cc-text-tertiary)" }}
                >
                  {result.proxyLabel}
                </p>
              )}
            </div>
          )}

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
