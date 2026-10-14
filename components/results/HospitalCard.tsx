"use client";

import { forwardRef } from "react";
import type { GroupedChargeResult } from "@/types";
import {
  displayName,
  formatDistance,
  formatPrice,
  getDisplayPrice,
  notNull,
} from "@/lib/format";
import {
  priceTypeLabel,
  scopeLabel,
  type PriceEntry,
} from "@/lib/results/summarize";
import { describeEpisode } from "@/lib/results/episode-display";
import { EpisodeEstimateRows } from "./EpisodeEstimateRows";

interface HospitalCardProps {
  entry: PriceEntry;
  isLowest: boolean;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * Hospital files often repeat the city in the street field or leave the
 * literal text "NULL" in it, so clean before joining.
 */
function addressOf(entry: PriceEntry): string {
  const p = entry.primary.provider;
  const street = (p.address ?? "")
    .replace(/\bnull\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,]+$/, "")
    .trim();
  const cityLine = [p.city, [p.state, p.zip].filter(notNull).join(" ")]
    .filter(notNull)
    .join(", ");
  if (!street) return cityLine;
  const repeatsCity =
    (p.city && street.toLowerCase().includes(p.city.toLowerCase())) ||
    (p.zip && street.includes(p.zip));
  if (repeatsCity) {
    return street;
  }
  return [street, cityLine].filter(Boolean).join(", ");
}

function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const styles = {
    neutral: {
      background: "var(--cc-surface-alt)",
      color: "var(--cc-text-secondary)",
    },
    good: { background: "var(--cc-primary-light)", color: "var(--cc-primary)" },
    warn: { background: "var(--cc-accent-light)", color: "var(--cc-accent)" },
  }[tone];
  return (
    <span
      className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={styles}
    >
      {children}
    </span>
  );
}

export const HospitalCard = forwardRef<HTMLLIElement, HospitalCardProps>(
  function HospitalCard(
    { entry, isLowest, isSelected, isExpanded, onToggle },
    ref
  ) {
    const r = entry.primary;
    const name = displayName(r.provider.name);
    const others = entry.locations.length - 1;
    const scope = scopeLabel(entry.scope);
    const address = addressOf(entry);
    const variants = (r as GroupedChargeResult).chargeVariants ?? [];
    const episode = describeEpisode(r.episodeEstimate);
    const estTotal = r.estimatedTotalMedian;
    const detailId = `hospital-${r.id}`;
    const phone = notNull(r.provider.phone) ? r.provider.phone : undefined;
    const website =
      r.provider.website && /^https?:\/\//i.test(r.provider.website)
        ? r.provider.website
        : undefined;

    return (
      <li
        ref={ref}
        className="rounded-xl border transition-colors"
        style={{
          background: "var(--cc-surface)",
          borderColor: isSelected ? "var(--cc-primary)" : "var(--cc-border)",
          boxShadow: isSelected ? "0 0 0 1px var(--cc-primary)" : undefined,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={detailId}
          className="w-full text-left px-4 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-xl hover:bg-[var(--cc-surface-hover)] transition-colors"
        >
          <span
            className="font-semibold text-[15px] leading-snug"
            style={{ color: "var(--cc-text)" }}
          >
            {name}
          </span>
          <span
            className="num text-[18px] font-semibold text-right leading-snug"
            style={{ color: "var(--cc-text)" }}
          >
            {entry.price.amount != null ? formatPrice(entry.price.amount) : "—"}
          </span>
          <span
            className="text-[13px]"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            {[r.provider.city, formatDistance(r.distanceMiles)]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span
            className="text-[12px] text-right"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            {priceTypeLabel(entry.price)}
          </span>
          {(isLowest || scope || others > 0) && (
            <span className="col-span-2 flex flex-wrap gap-1.5 mt-1">
              {isLowest && <Tag tone="good">Lowest</Tag>}
              {scope && (
                <Tag tone={entry.scope === "professional" ? "warn" : "neutral"}>
                  {scope}
                </Tag>
              )}
              {others > 0 && (
                <Tag>
                  Same price at {others} other location{others > 1 ? "s" : ""}
                </Tag>
              )}
            </span>
          )}
        </button>

        {isExpanded && (
          <div id={detailId} className="px-4 pb-4 animate-fade-in">
            {address && (
              <p
                className="text-[13px] mb-3"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                {address}
              </p>
            )}

            <div className="slip">
              {r.cashPrice != null && (
                <div className="slip-row">
                  <span>Cash price</span>
                  <span>{formatPrice(r.cashPrice)}</span>
                </div>
              )}
              {r.avgNegotiatedRate != null && (
                <div className="slip-row">
                  <span>
                    What insurers pay on average
                    {r.payerCount ? (
                      <span className="slip-note">
                        across {r.payerCount} plan{r.payerCount > 1 ? "s" : ""}
                        {r.minNegotiatedRate != null &&
                          r.maxNegotiatedRate != null &&
                          `, ${formatPrice(r.minNegotiatedRate)} to ${formatPrice(r.maxNegotiatedRate)}`}
                      </span>
                    ) : null}
                  </span>
                  <span>{formatPrice(r.avgNegotiatedRate)}</span>
                </div>
              )}
              {r.grossCharge != null && r.grossCharge !== r.cashPrice && (
                <div className="slip-row">
                  <span>
                    List price
                    <span className="slip-note">almost nobody pays this</span>
                  </span>
                  <span>{formatPrice(r.grossCharge)}</span>
                </div>
              )}
              {entry.scope === "facility" && (
                <div className="slip-row">
                  <span>Doctor&rsquo;s fee</span>
                  <span style={{ color: "var(--cc-accent)" }}>
                    Billed separately
                  </span>
                </div>
              )}
              {entry.scope === "professional" && (
                <div className="slip-row">
                  <span>Hospital fee</span>
                  <span style={{ color: "var(--cc-accent)" }}>
                    Billed separately
                  </span>
                </div>
              )}
              {episode && <EpisodeEstimateRows display={episode} />}
              {!episode &&
                estTotal != null &&
                estTotal !== entry.price.amount && (
                  <div className="slip-row">
                    <span>
                      Estimated total
                      <span className="slip-note">with likely extras</span>
                    </span>
                    <span>{formatPrice(estTotal)}</span>
                  </div>
                )}
            </div>

            {variants.length > 1 && (
              <div className="mt-3">
                <p
                  className="text-[12px] font-semibold mb-1"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {variants.length} price lines at this hospital
                </p>
                <ul
                  className="text-[12px] space-y-1"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {variants.map((v) => {
                    const vp = getDisplayPrice({ ...v, provider: r.provider });
                    return (
                      <li key={v.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {v.description || "Unlabeled line"}
                        </span>
                        <span className="num shrink-0">
                          {formatPrice(vp.amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {others > 0 && (
              <div className="mt-3">
                <p
                  className="text-[12px] font-semibold mb-1"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  The same price list covers
                </p>
                <ul
                  className="text-[12px] space-y-1"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {entry.locations.slice(1).map((loc) => (
                    <li key={loc.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {displayName(loc.provider.name)}
                      </span>
                      <span className="num shrink-0">
                        {formatDistance(loc.distanceMiles)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              {r.provider.lat != null && r.provider.lng != null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${r.provider.lat},${r.provider.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ background: "var(--cc-primary)" }}
                >
                  Directions
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="text-[13px] font-semibold px-3 py-1.5 rounded-lg border"
                  style={{
                    borderColor: "var(--cc-primary)",
                    color: "var(--cc-primary)",
                  }}
                >
                  Call to confirm
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium px-3 py-1.5 rounded-lg"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Website
                </a>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }
);
