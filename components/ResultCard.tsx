"use client";

import {
  formatPrice,
  formatDistance,
  formatDate,
  formatBillingCode,
  getDisplayPrice,
  formatDisplayPrice,
} from "@/lib/format";
import type { ChargeResult, GroupedChargeResult } from "@/types";
import { InfoCircleIcon } from "./InfoCircleIcon";
import { Tooltip } from "./Tooltip";

const notNull = (v: string | undefined): v is string =>
  !!v && v.toLowerCase() !== "null";

interface ResultCardProps {
  result: ChargeResult;
  rank: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
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

function billingClassLabel(bc: string | undefined): string {
  const normalized = bc?.toLowerCase();
  if (normalized === "facility") return "Facility fee";
  if (normalized === "professional") return "Professional fee";
  if (normalized === "both") return "Global fee";
  return "Full charge";
}

export function ResultCard({
  result,
  rank,
  isSelected,
  isExpanded,
  onToggleExpand,
  codeDescriptionMap,
}: ResultCardProps) {
  const billingCode = formatBillingCode(result);
  const distance = formatDistance(result.distanceMiles);
  const lastUpdated = formatDate(result.lastUpdated);
  const displayPrice = getDisplayPrice(result);

  const isGrouped = "chargeVariants" in result;
  const grouped = isGrouped ? (result as GroupedChargeResult) : undefined;
  const variants = grouped?.chargeVariants;
  const hasVariants = (grouped?.variantCount ?? 1) > 1;

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
    [result.provider.state, result.provider.zip].filter(notNull).join(" "),
  ]
    .filter(notNull)
    .join(", ");

  // Suppress single-charge billing class callout when variant breakdown is shown
  const billingClassCallout = hasVariants
    ? null
    : (() => {
        const bc = result.billingClass?.toLowerCase();
        if (bc === "facility")
          return "Facility fee only — professional fees may apply separately";
        if (bc === "professional")
          return "Professional fee only — facility charges may apply separately";
        return null;
      })();

  const priceColor =
    displayPrice.type === "cash"
      ? "var(--cc-primary)"
      : displayPrice.type === "insured"
        ? "var(--cc-info)"
        : displayPrice.type === "gross"
          ? "var(--cc-accent)"
          : "var(--cc-text-tertiary)";

  return (
    <div
      data-result-id={result.id}
      className={`rounded-xl border overflow-hidden transition-all duration-300 ${isExpanded ? "card-hover" : ""}`}
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

        <div className="flex-1 min-w-0">
          {/* Collapsed header row — always visible */}
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
            role="button"
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
          >
            {/* Rank badge */}
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-lg text-[11px] font-semibold shrink-0"
              style={{
                background:
                  rank <= 3
                    ? "var(--cc-primary-light)"
                    : "var(--cc-surface-alt)",
                color:
                  rank <= 3 ? "var(--cc-primary)" : "var(--cc-text-tertiary)",
              }}
            >
              {rank}
            </span>

            {/* Provider name */}
            <span
              className="text-sm font-semibold truncate min-w-0"
              style={{ color: "var(--cc-text)" }}
            >
              {result.provider.name}
            </span>

            {/* Setting badge */}
            {result.setting && (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded-md font-medium shrink-0 hidden sm:inline"
                style={{
                  background: "var(--cc-surface-alt)",
                  color: "var(--cc-text-tertiary)",
                }}
              >
                {result.setting}
              </span>
            )}

            {/* Spacer */}
            <span className="flex-1" />

            {/* Price */}
            <span
              className="text-sm font-bold shrink-0"
              style={{ color: priceColor }}
            >
              {formatDisplayPrice(displayPrice)}
            </span>

            {/* Distance */}
            {distance && (
              <span
                className="text-xs shrink-0 hidden sm:inline"
                style={{ color: "var(--cc-text-tertiary)" }}
              >
                {distance}
              </span>
            )}

            {/* Chevron */}
            <svg
              className="w-4 h-4 shrink-0 transition-transform duration-200"
              style={{
                color: "var(--cc-text-tertiary)",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* Accordion body */}
          <div className={`accordion-body ${isExpanded ? "expanded" : ""}`}>
            <div>
              <div className="px-4 pb-4">
                {/* Expanded header details */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    {address && (
                      <p
                        className="text-sm truncate"
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
                        {result.isDiscounted === false && (
                          <Tooltip
                            text="This hospital's listed cash price matches their chargemaster rate with no discount applied. There may be room to negotiate a lower price directly with the facility."
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full cursor-help mt-0.5"
                            style={{
                              background: "var(--cc-accent-light)",
                              color: "var(--cc-accent)",
                            }}
                          >
                            <InfoCircleIcon className="w-3 h-3" />
                            List Price
                          </Tooltip>
                        )}
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
                          <Tooltip
                            text="Average rate negotiated between this hospital and insurers. Your actual cost depends on your specific plan."
                            className="inline-block ml-1 align-middle cursor-help"
                          >
                            <InfoCircleIcon className="w-4 h-4 inline" />
                          </Tooltip>
                        </p>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--cc-text-tertiary)" }}
                        >
                          {displayPrice.label}
                        </p>
                      </>
                    ) : displayPrice.type === "gross" ? (
                      <>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: "var(--cc-accent)" }}
                        >
                          {formatDisplayPrice(displayPrice)}
                        </p>
                        <Tooltip
                          text="No cash or insured price reported. This is the hospital's chargemaster rate — there may be room to negotiate."
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full cursor-help mt-0.5"
                          style={{
                            background: "var(--cc-accent-light)",
                            color: "var(--cc-accent)",
                          }}
                        >
                          <InfoCircleIcon className="w-3 h-3" />
                          List Price
                        </Tooltip>
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
                    {result.episodeEstimate?.estimatedAllInMedian != null ? (
                      <div className="mt-1.5">
                        <p
                          className="text-xs font-medium"
                          style={{ color: "var(--cc-text-secondary)" }}
                        >
                          Est. all-in:{" "}
                          {formatPrice(
                            result.episodeEstimate.estimatedAllInMedian
                          )}
                        </p>
                        <p
                          className="text-[11px]"
                          style={{ color: "var(--cc-text-tertiary)" }}
                        >
                          {result.episodeEstimate.label} episode
                          {result.episodeEstimate.coverageRatio < 1 &&
                            ` (${Math.round(result.episodeEstimate.coverageRatio * 100)}% of components priced)`}
                        </p>
                      </div>
                    ) : (
                      result.estimatedTotalMedian != null && (
                        <p
                          className="text-xs mt-1.5"
                          style={{ color: "var(--cc-text-secondary)" }}
                        >
                          Est. total: {formatPrice(result.estimatedTotalMedian)}
                        </p>
                      )
                    )}
                  </div>
                </div>

                {/* Billing class callout */}
                {billingClassCallout && (
                  <div
                    className="flex items-start gap-1.5 mt-2"
                    style={{ color: "var(--cc-accent)" }}
                  >
                    <InfoCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-xs">{billingClassCallout}</span>
                  </div>
                )}

                {/* Price variants breakdown */}
                {hasVariants && variants && (
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
                      Price variants at this facility
                    </p>
                    <div className="mt-2 space-y-1">
                      {variants.map((v) => {
                        const vp = getDisplayPrice(v as ChargeResult);
                        const isPrimary = v.id === result.id;
                        return (
                          <div
                            key={v.id}
                            className="flex items-center gap-2 py-1 px-2 rounded"
                            style={{
                              borderLeft: isPrimary
                                ? "2px solid var(--cc-primary)"
                                : "2px solid transparent",
                              background: isPrimary
                                ? "var(--cc-primary-light)"
                                : undefined,
                            }}
                          >
                            <span
                              className="text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
                              style={{
                                background: "var(--cc-surface)",
                                color: "var(--cc-text-secondary)",
                                border: "1px solid var(--cc-border)",
                              }}
                            >
                              {billingClassLabel(v.billingClass)}
                            </span>
                            <span
                              className="text-xs truncate min-w-0"
                              style={{
                                color: isPrimary
                                  ? "var(--cc-text)"
                                  : "var(--cc-text-tertiary)",
                              }}
                              title={v.description}
                            >
                              {v.description || "—"}
                            </span>
                            <span className="flex-1" />
                            <span
                              className="text-xs font-semibold shrink-0"
                              style={{
                                color: isPrimary
                                  ? "var(--cc-primary)"
                                  : "var(--cc-text-secondary)",
                              }}
                            >
                              {formatDisplayPrice(vp)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div
                      className="flex items-start gap-1 mt-2"
                      style={{ color: "var(--cc-text-tertiary)" }}
                    >
                      <InfoCircleIcon className="w-3 h-3 shrink-0 mt-0.5" />
                      <span className="text-[11px]">
                        Different billing contexts for the same procedure. The
                        highlighted row is shown above.
                      </span>
                    </div>
                  </div>
                )}

                {/* Footer row */}
                <div
                  className="mt-3 pt-3 flex items-center justify-between flex-wrap gap-2"
                  style={{ borderTop: "1px solid var(--cc-border)" }}
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    {result.medicareFacilityRate != null && (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-xs"
                          style={{ color: "var(--cc-text-tertiary)" }}
                        >
                          Medicare:
                        </span>
                        <span
                          className="text-sm font-semibold"
                          style={{ color: "var(--cc-success)" }}
                        >
                          {formatPrice(result.medicareFacilityRate)}
                        </span>
                        <Tooltip
                          text="What Medicare pays for this service (CMS Physician Fee Schedule, national rate). Hospitals often charge significantly more."
                          className="inline-block cursor-help"
                        >
                          <InfoCircleIcon
                            className="w-3 h-3"
                            style={{ color: "var(--cc-text-tertiary)" }}
                          />
                        </Tooltip>
                        {result.medicareMultiplier != null &&
                          result.medicareMultiplier > 1 && (
                            <span
                              className="text-[11px] font-medium px-1.5 py-0.5 rounded-md"
                              style={{
                                background:
                                  result.medicareMultiplier >= 5
                                    ? "var(--cc-error-light)"
                                    : result.medicareMultiplier >= 3
                                      ? "var(--cc-accent-light)"
                                      : "var(--cc-surface-alt)",
                                color:
                                  result.medicareMultiplier >= 5
                                    ? "var(--cc-error)"
                                    : result.medicareMultiplier >= 3
                                      ? "var(--cc-accent)"
                                      : "var(--cc-text-secondary)",
                              }}
                            >
                              {result.medicareMultiplier}× Medicare
                              {result.medicareMultiplierSource === "gross" &&
                                " (list price)"}
                            </span>
                          )}
                      </div>
                    )}
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
                          {result.payerCount != null &&
                            result.payerCount > 0 && (
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
                        onClick={(e) => e.stopPropagation()}
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
        </div>
      </div>
    </div>
  );
}
