"use client";

import type { ChargeResult } from "@/types";
import { ResultCard } from "./ResultCard";

interface ResultsListProps {
  results: ChargeResult[];
  loading?: boolean;
  loadingStage?: string; // "Translating..." | "Finding prices..." | etc.
}

export function ResultsList({ results, loading, loadingStage }: ResultsListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Loading stage indicator */}
        {loadingStage && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <span className="loading loading-spinner loading-sm" />
            {loadingStage}
          </div>
        )}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="card bg-white border border-gray-200 animate-pulse"
          >
            <div className="card-body p-4">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mt-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3 mt-1" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">
          No results found. Try adjusting your search or expanding your location radius.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Result count context */}
      <p className="text-sm text-gray-500">
        {results.length} result{results.length !== 1 ? "s" : ""} found, sorted
        by lowest price
      </p>

      {/* Graceful degradation: limited data disclaimer */}
      {results.length < 3 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">
            Limited pricing data available for this area. Try expanding your
            search radius or searching in a nearby metro area.
          </p>
        </div>
      )}

      {results.map((result, i) => (
        <ResultCard key={result.id} result={result} rank={i + 1} />
      ))}
    </div>
  );
}
