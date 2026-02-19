"use client";

import type { ChargeResult } from "@/types";

interface ResultCardProps {
  result: ChargeResult;
  rank: number;
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

/** Returns a display string for the billing code (e.g., "CPT 73721") */
function formatBillingCode(result: ChargeResult): string {
  if (result.cpt) return `CPT ${result.cpt}`;
  if (result.hcpcs) return `HCPCS ${result.hcpcs}`;
  if (result.msDrg) return `MS-DRG ${result.msDrg}`;
  return "";
}

export function ResultCard({ result, rank }: ResultCardProps) {
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
    <div className="card bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="card-body p-4">
        {/* Header: Provider name + distance */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="badge badge-sm bg-gray-100 text-gray-600 border-none">
                #{rank}
              </span>
              <h3 className="font-semibold text-gray-900">
                {result.provider.name}
              </h3>
              {result.setting && (
                <span className="badge badge-sm bg-purple-50 text-purple-700 border-purple-200">
                  {result.setting}
                </span>
              )}
            </div>
            {address && (
              <p className="text-sm text-gray-500 mt-1">{address}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {billingCode && (
                <span className="text-xs text-gray-400">{billingCode}</span>
              )}
              {result.description && (
                <span className="text-xs text-gray-400">
                  {billingCode ? "· " : ""}
                  {result.description}
                </span>
              )}
            </div>
          </div>

          {/* Price column */}
          <div className="text-right ml-4 flex-shrink-0">
            {result.cashPrice != null ? (
              <>
                {/* Gross charge strikethrough if available */}
                {result.grossCharge != null && result.grossCharge > (result.cashPrice || 0) && (
                  <p className="text-xs text-gray-400 line-through">
                    {formatPrice(result.grossCharge)}
                  </p>
                )}
                <p className="text-2xl font-bold text-gray-900">
                  {formatPrice(result.cashPrice)}
                </p>
                <p className="text-xs text-gray-400">Cash price</p>
              </>
            ) : (
              <p className="text-sm text-gray-400">Price unavailable</p>
            )}

            {/* Price range */}
            {result.minPrice != null && result.maxPrice != null && (
              <p className="text-xs text-gray-400 mt-0.5">
                Range: {formatPrice(result.minPrice)} – {formatPrice(result.maxPrice)}
              </p>
            )}
          </div>
        </div>

        {/* Negotiated rate summary + distance row */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Average insured rate */}
            {result.avgNegotiatedRate != null && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Avg insured:</span>
                <span className="text-sm font-medium text-blue-700">
                  {formatPrice(result.avgNegotiatedRate)}
                </span>
                {result.payerCount != null && result.payerCount > 0 && (
                  <span className="text-xs text-gray-400">
                    ({result.payerCount} payer{result.payerCount !== 1 ? "s" : ""})
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            {/* Distance */}
            {distance && (
              <span className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {distance}
              </span>
            )}
          </div>
        </div>

        {/* Data freshness + source attribution */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            {lastUpdated && <span>Prices updated: {lastUpdated}</span>}
            <span>Source: Hospital MRF data</span>
          </div>
          {result.provider.phone && (
            <a
              href={`tel:${result.provider.phone}`}
              className="text-xs text-blue-500 hover:underline"
            >
              {result.provider.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
