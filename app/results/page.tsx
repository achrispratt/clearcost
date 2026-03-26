"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ResultsList } from "@/components/ResultsList";
import { useNavbarSlot } from "@/components/NavbarContext";
import { FilterBar } from "@/components/FilterBar";
import { MapView } from "@/components/MapView";
import { SaveButton } from "@/components/SaveButton";
import { useResultsSearch } from "./useResultsSearch";
import { useResultSelection } from "./useResultSelection";

const RADIUS_TIERS = [10, 25, 50, 100, 250];

function ResultsContent() {
  const {
    query,
    lat,
    lng,
    locationDisplay,
    results,
    filteredResults,
    cptCodes,
    interpretation,
    loading,
    error,
    view,
    setView,
    handleNewSearch,
    handleFilteredResults,
    radius,
    handleRadiusChange,
    logResultClick,
    logSaveSearch,
  } = useResultsSearch();

  const handleExpandRadius = useCallback(() => {
    const currentIndex = RADIUS_TIERS.indexOf(radius);
    let nextRadius: number;
    if (currentIndex === -1) {
      nextRadius = RADIUS_TIERS.find((t) => t > radius) ?? 250;
    } else {
      const nextIndex = Math.min(currentIndex + 1, RADIUS_TIERS.length - 1);
      nextRadius = RADIUS_TIERS[nextIndex];
    }
    handleRadiusChange(nextRadius);
  }, [radius, handleRadiusChange]);

  const {
    selectedProviderId,
    markerClickCount,
    handleMarkerClick,
    handleCardSelect,
  } = useResultSelection();

  const codeDescriptionMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const code of cptCodes) {
      if (code.code && code.description) map[code.code] = code.description;
    }
    return map;
  }, [cptCodes]);

  // Inject search bar + interpretation into the navbar
  const { setSearchSlot } = useNavbarSlot();
  useEffect(() => {
    setSearchSlot(
      <SearchBar
        onSearch={handleNewSearch}
        loading={loading}
        initialQuery={query}
        initialLocation={
          lat && lng ? { lat, lng, display: locationDisplay } : undefined
        }
        compact
      />
    );
    return () => setSearchSlot(null);
  }, [
    setSearchSlot,
    handleNewSearch,
    loading,
    query,
    lat,
    lng,
    locationDisplay,
  ]);

  return (
    <div>
      {/* Filter bar + controls — flush below navbar */}
      <div
        className="px-4 lg:px-6 border-b flex items-center gap-2"
        style={{ borderColor: "var(--cc-border)", background: "var(--cc-bg)" }}
      >
        {/* Mobile view toggle */}
        <div className="lg:hidden">
          <div className="pill-group">
            <button
              onClick={() => setView("list")}
              className={`pill-btn ${view === "list" ? "pill-btn-active" : ""}`}
            >
              List
            </button>
            <button
              onClick={() => setView("map")}
              className={`pill-btn ${view === "map" ? "pill-btn-active" : ""}`}
            >
              Map
            </button>
          </div>
        </div>

        {/* Filters */}
        {!loading && results.length > 0 && (
          <FilterBar
            results={results}
            onFilteredResults={handleFilteredResults}
            radius={radius}
            onRadiusChange={handleRadiusChange}
          />
        )}

        {/* Results count */}
        {!loading && filteredResults.length > 0 && (
          <span
            className="text-[12px] whitespace-nowrap"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            {filteredResults.length} result
            {filteredResults.length !== 1 ? "s" : ""}
          </span>
        )}

        <div className="flex-1" />

        {/* Interpretation — label + code pill with hover tooltip */}
        {interpretation && !loading && (
          <div className="relative hidden sm:inline-flex items-center group">
            <span
              className="text-[11px] px-1.5 py-0.5 rounded cursor-help inline-flex items-center gap-1"
              style={{
                background: "var(--cc-primary-light)",
                color: "var(--cc-primary)",
                fontWeight: 500,
              }}
            >
              Interpreted:
              {cptCodes.length > 0 && (
                <span className="font-semibold">
                  {cptCodes[0].codeType?.toUpperCase()} {cptCodes[0].code}
                </span>
              )}
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            {/* Hover tooltip */}
            <div
              className="absolute top-full right-0 mt-1 p-3 rounded-lg border text-[12px] w-80 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150"
              style={{
                background: "var(--cc-surface)",
                borderColor: "var(--cc-border)",
                color: "var(--cc-text-secondary)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
            >
              <p
                className="font-semibold mb-1"
                style={{ color: "var(--cc-text)" }}
              >
                How we interpreted your search
              </p>
              <p>{interpretation}</p>
              {cptCodes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cptCodes.map((code) => (
                    <span
                      key={code.code}
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: "var(--cc-primary-light)",
                        color: "var(--cc-primary)",
                      }}
                    >
                      {(code.codeType || "CPT").toUpperCase()} {code.code}:{" "}
                      {code.description}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Save — small icon button */}
        {!loading && results.length > 0 && (
          <SaveButton
            query={query}
            location={locationDisplay}
            cptCodes={cptCodes.map((c) => c.code)}
            lat={lat}
            lng={lng}
            onSave={logSaveSearch}
          />
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          className="mx-4 mt-2 p-3 rounded-lg border"
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

      {/* Content section — split view on desktop, toggle on mobile */}
      <div className="max-w-full px-4 lg:px-6">
        <div className="lg:flex lg:gap-4">
          {/* Left column: Results list */}
          <div
            className={`lg:w-1/2 lg:overflow-y-auto lg:pr-2 ${
              view === "map" ? "hidden lg:block" : ""
            }`}
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            <ResultsList
              results={filteredResults}
              loading={loading}
              selectedProviderId={selectedProviderId}
              markerClickCount={markerClickCount}
              onCardSelect={handleCardSelect}
              onResultClick={logResultClick}
              codeDescriptionMap={codeDescriptionMap}
              locationDisplay={locationDisplay}
              onExpandRadius={radius < 250 ? handleExpandRadius : undefined}
            />
          </div>

          {/* Right column: Map */}
          <div
            className={`lg:w-1/2 lg:sticky lg:top-[72px] mt-4 lg:mt-0 ${
              view === "list" ? "hidden lg:block" : ""
            }`}
            style={{ height: "calc(100vh - 120px)" }}
          >
            <MapView
              results={filteredResults}
              center={{ lat, lng }}
              onMarkerClick={handleMarkerClick}
              selectedProviderId={selectedProviderId}
              className="h-full"
            />
          </div>
        </div>
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
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.25"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
