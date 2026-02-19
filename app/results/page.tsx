"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { ResultsList } from "@/components/ResultsList";
import { FilterBar, SortOption } from "@/components/FilterBar";
import { MapView } from "@/components/MapView";
import { SaveButton } from "@/components/SaveButton";
import type { ChargeResult, CPTCode } from "@/types";

function ResultsContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const locationDisplay = searchParams.get("loc") || "";

  const [results, setResults] = useState<ChargeResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ChargeResult[]>([]);
  const [cptCodes, setCptCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if (!query || !lat || !lng) return;

    const search = async () => {
      setLoading(true);
      setError(null);
      setLoadingStage("Translating your query...");

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            location: { lat, lng },
          }),
        });

        setLoadingStage("Finding prices near you...");

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Search failed");
        }

        const data = await response.json();
        setResults(data.results);
        setFilteredResults(data.results);
        setCptCodes(data.cptCodes);
        setInterpretation(data.interpretation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
        setLoadingStage("");
      }
    };

    search();
  }, [query, lat, lng]);

  const handleNewSearch = (
    newQuery: string,
    location: { lat: number; lng: number; display: string }
  ) => {
    const params = new URLSearchParams({
      q: newQuery,
      lat: location.lat.toString(),
      lng: location.lng.toString(),
      loc: location.display,
    });
    window.history.pushState({}, "", `/results?${params.toString()}`);
    window.location.reload();
  };

  const handleFilteredResults = useCallback((filtered: ChargeResult[]) => {
    setFilteredResults(filtered);
  }, []);

  const handleSortChange = useCallback((_sort: SortOption) => {
    // Sort is handled inside FilterBar via onFilteredResults
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <SearchBar
        onSearch={handleNewSearch}
        loading={loading}
        initialQuery={query}
      />

      {/* Interpretation + billing codes */}
      {interpretation && !loading && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            <span className="font-medium">Interpreted as:</span>{" "}
            {interpretation}
          </p>
          {cptCodes.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {cptCodes.map((code) => (
                <span
                  key={code.code}
                  className="badge bg-blue-100 text-blue-800 border-blue-200 text-xs"
                >
                  {(code.codeType || "CPT").toUpperCase()} {code.code}: {code.description}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* View toggle + Save button */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setView("list")}
              className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-ghost"}`}
            >
              List
            </button>
            <button
              onClick={() => setView("map")}
              className={`btn btn-sm ${view === "map" ? "btn-primary" : "btn-ghost"}`}
            >
              Map
            </button>
          </div>
          {!loading && results.length > 0 && (
            <SaveButton
              query={query}
              location={locationDisplay}
              cptCodes={cptCodes.map((c) => c.code)}
              lat={lat}
              lng={lng}
            />
          )}
        </div>

        {/* Filter bar (only visible when we have results) */}
        {!loading && results.length > 0 && (
          <FilterBar
            results={results}
            onFilteredResults={handleFilteredResults}
            onSortChange={handleSortChange}
          />
        )}
      </div>

      {/* Results: list or map */}
      <div className="mt-2">
        {view === "list" ? (
          <ResultsList
            results={filteredResults}
            loading={loading}
            loadingStage={loadingStage}
          />
        ) : (
          <MapView results={filteredResults} center={{ lat, lng }} />
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-lg" />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
