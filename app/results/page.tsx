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
  const directCodes = searchParams.get("codes")?.split(",").filter(Boolean) || [];
  const directCodeType = searchParams.get("codeType") || "";
  const directInterp = searchParams.get("interp") || "";

  const [results, setResults] = useState<ChargeResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ChargeResult[]>([]);
  const [cptCodes, setCptCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if ((!query && directCodes.length === 0) || !lat || !lng) return;

    const search = async () => {
      setLoading(true);
      setError(null);

      // Direct code lookup skips AI translation
      const hasDirectCodes = directCodes.length > 0;
      setLoadingStage(hasDirectCodes ? "Finding prices near you..." : "Translating your query...");

      try {
        const requestBody: Record<string, unknown> = {
          query,
          location: { lat, lng },
        };

        // Pass codes directly if from guided search
        if (hasDirectCodes) {
          requestBody.codes = directCodes;
          requestBody.codeType = directCodeType || "cpt";
        }

        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!hasDirectCodes) {
          setLoadingStage("Finding prices near you...");
        }

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Search failed");
        }

        const data = await response.json();
        setResults(data.results);
        setFilteredResults(data.results);
        setCptCodes(data.cptCodes || []);
        setInterpretation(data.interpretation || directInterp);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
        setLoadingStage("");
      }
    };

    search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lat, lng, directCodes.join(","), directCodeType, directInterp]);

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
    // Route new searches through guided search for clarification
    window.location.href = `/guided-search?${params.toString()}`;
  };

  const handleFilteredResults = useCallback((filtered: ChargeResult[]) => {
    setFilteredResults(filtered);
  }, []);

  const handleSortChange = useCallback((_sort: SortOption) => {
    // Sort is handled inside FilterBar via onFilteredResults
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-5">
      {/* Search bar (compact) */}
      <SearchBar
        onSearch={handleNewSearch}
        loading={loading}
        initialQuery={query}
        compact
      />

      {/* Interpretation banner */}
      {interpretation && !loading && (
        <div
          className="mt-4 p-4 rounded-xl border animate-fade-in"
          style={{
            background: "var(--cc-primary-light)",
            borderColor: "rgba(15, 118, 110, 0.12)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              style={{ color: "var(--cc-primary)" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
            </svg>
            <div>
              <p className="text-sm" style={{ color: "var(--cc-primary)" }}>
                <span className="font-semibold">Interpreted as:</span>{" "}
                {interpretation}
              </p>
              {cptCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cptCodes.map((code) => (
                    <span
                      key={code.code}
                      className="text-xs px-2 py-0.5 rounded-md font-medium"
                      style={{
                        background: "rgba(15, 118, 110, 0.1)",
                        color: "var(--cc-primary)",
                      }}
                    >
                      {(code.codeType || "CPT").toUpperCase()} {code.code}: {code.description}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          className="mt-4 p-4 rounded-xl border"
          style={{
            background: "var(--cc-error-light)",
            borderColor: "rgba(220, 38, 38, 0.15)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--cc-error)" }}>
            {error}
          </p>
        </div>
      )}

      {/* Toolbar: View toggle + Save */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="pill-group">
            <button
              onClick={() => setView("list")}
              className={`pill-btn ${view === "list" ? "pill-btn-active" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                List
              </span>
            </button>
            <button
              onClick={() => setView("map")}
              className={`pill-btn ${view === "map" ? "pill-btn-active" : ""}`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                Map
              </span>
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

        {/* Filter bar */}
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
        <div className="flex justify-center py-16">
          <svg
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--cc-primary)" }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
