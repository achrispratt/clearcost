"use client";

import { useState, useEffect } from "react";
import type { ChargeResult } from "@/types";
import { getDisplayPrice, getDisplayPriceAmount } from "@/lib/format";

export type PriceTypeFilter = "all" | "cash";

export type SortOption =
  | "price-asc"
  | "price-desc"
  | "estimated-total"
  | "distance"
  | "name";

interface FilterBarProps {
  results: ChargeResult[];
  onFilteredResults: (filtered: ChargeResult[]) => void;
  radius?: number;
  onRadiusChange?: (radius: number) => void;
}

export function FilterBar({
  results,
  onFilteredResults,
  radius: controlledRadius,
  onRadiusChange,
}: FilterBarProps) {
  const [sort, setSort] = useState<SortOption>("distance");
  const [internalRadius, setInternalRadius] = useState<number>(25);
  const radius = controlledRadius ?? internalRadius;
  const setRadius = onRadiusChange ?? setInternalRadius;
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [priceType, setPriceType] = useState<PriceTypeFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    let filtered = [...results];

    filtered = filtered.filter(
      (r) => r.distanceMiles == null || r.distanceMiles <= radius
    );

    if (priceType === "cash") {
      filtered = filtered.filter((r) => getDisplayPrice(r).type === "cash");
    }

    if (maxPrice != null) {
      filtered = filtered.filter((r) => {
        const price = getDisplayPriceAmount(r);
        return price != null && price <= maxPrice;
      });
    }

    filtered.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (
            (getDisplayPriceAmount(a) ?? Infinity) -
            (getDisplayPriceAmount(b) ?? Infinity)
          );
        case "price-desc":
          return (
            (getDisplayPriceAmount(b) ?? 0) - (getDisplayPriceAmount(a) ?? 0)
          );
        case "estimated-total":
          return (
            (a.estimatedTotalMedian ?? getDisplayPriceAmount(a) ?? Infinity) -
            (b.estimatedTotalMedian ?? getDisplayPriceAmount(b) ?? Infinity)
          );
        case "distance":
          return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
        case "name":
          return a.provider.name.localeCompare(b.provider.name);
        default:
          return 0;
      }
    });

    onFilteredResults(filtered);
  }, [results, sort, radius, maxPrice, priceType, onFilteredResults]);

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
  };

  const hasFilters = maxPrice != null || radius !== 25 || priceType !== "all";

  const selectStyles = {
    background: "var(--cc-surface)",
    borderColor: "var(--cc-border)",
    color: "var(--cc-text)",
    borderRadius: "8px",
    fontSize: "13px",
    padding: "4px 24px 4px 8px",
    height: "32px",
    border: "1px solid var(--cc-border)",
    outline: "none",
    cursor: "pointer",
    appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239B9BA8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 6px center",
  };

  const labelStyles = {
    fontSize: "12px",
    fontWeight: 500 as const,
    color: "var(--cc-text-tertiary)",
  };

  return (
    <div className="py-3">
      {/* Mobile toggle — hidden on desktop */}
      <button
        onClick={() => setFiltersOpen(!filtersOpen)}
        className="flex items-center gap-2 text-sm font-medium sm:hidden"
        style={{ color: "var(--cc-text-secondary)" }}
        aria-expanded={filtersOpen}
        aria-controls="filter-controls"
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
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
        Filters
        {hasFilters && (
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--cc-primary)" }}
          />
        )}
        <svg
          className={`w-3 h-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Filter controls — toggled on mobile, always visible on desktop */}
      <div
        id="filter-controls"
        className={`flex-wrap items-center gap-3 ${filtersOpen ? "flex mt-3" : "hidden"} sm:flex sm:mt-0`}
      >
        <div className="flex items-center gap-1.5">
          <span style={labelStyles}>Within</span>
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={selectStyles}
          >
            <option value={10}>10 mi</option>
            <option value={25}>25 mi</option>
            <option value={50}>50 mi</option>
            <option value={100}>100 mi</option>
            <option value={250}>250 mi</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span style={labelStyles}>Sort</span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as SortOption)}
            style={selectStyles}
          >
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="estimated-total">Estimated total</option>
            <option value="distance">Distance</option>
            <option value="name">Name</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span style={labelStyles}>Prices</span>
          <select
            value={priceType}
            onChange={(e) => setPriceType(e.target.value as PriceTypeFilter)}
            style={selectStyles}
          >
            <option value="all">All</option>
            <option value="cash">Cash only</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span style={labelStyles}>Max price</span>
          <select
            value={maxPrice ?? ""}
            onChange={(e) =>
              setMaxPrice(e.target.value ? parseInt(e.target.value) : null)
            }
            style={selectStyles}
          >
            <option value="">Any</option>
            <option value="500">$500</option>
            <option value="1000">$1,000</option>
            <option value="2500">$2,500</option>
            <option value="5000">$5,000</option>
            <option value="10000">$10,000</option>
          </select>
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setRadius(25);
              setMaxPrice(null);
              setPriceType("all");
            }}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--cc-surface-alt)] hover:text-[var(--cc-text-secondary)]"
            style={{
              color: "var(--cc-text-tertiary)",
              background: "transparent",
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
