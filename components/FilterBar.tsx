"use client";

import { useState, useEffect } from "react";
import type { ChargeResult, Payer } from "@/types";

export type SortOption = "price-asc" | "price-desc" | "distance" | "name";
export type SettingFilter = "all" | "inpatient" | "outpatient";

interface FilterBarProps {
  results: ChargeResult[];
  onFilteredResults: (filtered: ChargeResult[]) => void;
  onSortChange: (sort: SortOption) => void;
}

const RADIUS_OPTIONS = [
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
  { label: "100 mi", value: 100 },
  { label: "250 mi", value: 250 },
];

export function FilterBar({ results, onFilteredResults, onSortChange }: FilterBarProps) {
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [setting, setSetting] = useState<SettingFilter>("all");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<string>("");

  // Fetch available payers on mount
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

  // Apply filters + sort whenever inputs change
  useEffect(() => {
    let filtered = [...results];

    // Filter by setting
    if (setting !== "all") {
      filtered = filtered.filter(
        (r) => r.setting === setting || r.setting === "both" || !r.setting
      );
    }

    // Filter by max price
    if (maxPrice != null) {
      filtered = filtered.filter(
        (r) => r.cashPrice != null && r.cashPrice <= maxPrice
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (a.cashPrice ?? Infinity) - (b.cashPrice ?? Infinity);
        case "price-desc":
          return (b.cashPrice ?? 0) - (a.cashPrice ?? 0);
        case "distance":
          return (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity);
        case "name":
          return a.provider.name.localeCompare(b.provider.name);
        default:
          return 0;
      }
    });

    onFilteredResults(filtered);
  }, [results, sort, setting, maxPrice, selectedPayer, onFilteredResults]);

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort);
    onSortChange(newSort);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 font-medium">Sort:</span>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as SortOption)}
          className="select select-bordered select-xs bg-white"
        >
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
          <option value="distance">Distance</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Setting filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 font-medium">Setting:</span>
        <select
          value={setting}
          onChange={(e) => setSetting(e.target.value as SettingFilter)}
          className="select select-bordered select-xs bg-white"
        >
          <option value="all">All</option>
          <option value="outpatient">Outpatient</option>
          <option value="inpatient">Inpatient</option>
        </select>
      </div>

      {/* Max price filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 font-medium">Max price:</span>
        <select
          value={maxPrice ?? ""}
          onChange={(e) =>
            setMaxPrice(e.target.value ? parseInt(e.target.value) : null)
          }
          className="select select-bordered select-xs bg-white"
        >
          <option value="">Any</option>
          <option value="500">$500</option>
          <option value="1000">$1,000</option>
          <option value="2500">$2,500</option>
          <option value="5000">$5,000</option>
          <option value="10000">$10,000</option>
        </select>
      </div>

      {/* Insurance payer selector */}
      {payers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 font-medium">Insurance:</span>
          <select
            value={selectedPayer}
            onChange={(e) => setSelectedPayer(e.target.value)}
            className="select select-bordered select-xs bg-white"
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

      {/* Active filter count */}
      {(setting !== "all" || maxPrice != null || selectedPayer) && (
        <button
          onClick={() => {
            setSetting("all");
            setMaxPrice(null);
            setSelectedPayer("");
          }}
          className="btn btn-ghost btn-xs text-gray-400 hover:text-gray-600"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
