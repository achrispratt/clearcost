"use client";

import { useState, useEffect } from "react";
import type { ChargeResult, Payer } from "@/types";

export type SortOption = "price-asc" | "price-desc" | "estimated-total" | "distance" | "name";

interface FilterBarProps {
  results: ChargeResult[];
  onFilteredResults: (filtered: ChargeResult[]) => void;
}

export function FilterBar({ results, onFilteredResults }: FilterBarProps) {
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<string>("");

  useEffect(() => {
    const fetchPayers = async () => {
      try {
        const response = await fetch("/api/payers");
        if (response.ok) {
          const data = await response.json();
          setPayers(data);
        }
      } catch {
        // Silently fail — payer filter just won't be available
      }
    };
    fetchPayers();
  }, []);

  useEffect(() => {
    let filtered = [...results];

    if (maxPrice != null) {
      filtered = filtered.filter(
        (r) => r.cashPrice != null && r.cashPrice <= maxPrice
      );
    }

    filtered.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (a.cashPrice ?? Infinity) - (b.cashPrice ?? Infinity);
        case "price-desc":
          return (b.cashPrice ?? 0) - (a.cashPrice ?? 0);
        case "estimated-total":
          return (a.estimatedTotalMedian ?? a.cashPrice ?? Infinity) - (b.estimatedTotalMedian ?? b.cashPrice ?? Infinity);
        case "distance":
          return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
        case "name":
          return a.provider.name.localeCompare(b.provider.name);
        default:
          return 0;
      }
    });

    onFilteredResults(filtered);
  }, [results, sort, maxPrice, onFilteredResults]);

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
  };

  const hasFilters = maxPrice != null || selectedPayer;

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
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex items-center gap-1.5">
        <span style={labelStyles}>Sort</span>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as SortOption)}
          style={selectStyles}
        >
          <option value="price-asc">Base: Low to High</option>
          <option value="price-desc">Base: High to Low</option>
          <option value="estimated-total">Estimated total</option>
          <option value="distance">Distance</option>
          <option value="name">Name</option>
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

      {payers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span style={labelStyles}>Insurance</span>
          <select
            value={selectedPayer}
            onChange={(e) => setSelectedPayer(e.target.value)}
            style={selectStyles}
          >
            <option value="">Cash / Self-Pay</option>
            {payers.map((payer) => (
              <option key={payer.id} value={payer.name}>
                {payer.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasFilters && (
        <button
          onClick={() => {
            setMaxPrice(null);
            setSelectedPayer("");
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
  );
}
