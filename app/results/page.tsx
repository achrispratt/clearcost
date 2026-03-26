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
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <SearchBar
            onSearch={handleNewSearch}
            loading={loading}
            initialQuery={query}
            initialLocation={
              lat && lng ? { lat, lng, display: locationDisplay } : undefined
            }
            compact
          />
        </div>
        {interpretation && !loading && (
          <span
            className="text-[12px] hidden lg:block"
            style={{ color: "var(--cc-text-secondary)" }}
            title={interpretation}
          >
            <strong style={{ color: "var(--cc-primary)" }}>Interpreted:</strong>{" "}
            {interpretation}
            {cptCodes.length > 0 && (
              <span
                className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded"
                style={{
                  background: "var(--cc-primary-light)",
                  color: "var(--cc-primary)",
                  fontWeight: 600,
                }}
              >
                {cptCodes[0].codeType?.toUpperCase()} {cptCodes[0].code}
              </span>
            )}
          </span>
        )}
      </div>
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
    interpretation,
    cptCodes,
  ]);

  return (
    <div className="px-4 py-2">
      {/* Header section — constrained width */}
      <div className="max-w-5xl mx-auto lg:max-w-7xl">
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

        {/* Toolbar: View toggle (mobile only) + Save + Filters */}
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-between">
            {/* Toggle pills: mobile only */}
            <div className="lg:hidden">
              <div className="pill-group">
                <button
                  onClick={() => setView("list")}
                  className={`pill-btn ${view === "list" ? "pill-btn-active" : ""}`}
                >
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
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
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    Map
                  </span>
                </button>
              </div>
            </div>
            {/* Spacer on desktop where toggle was */}
            <div className="hidden lg:block" />

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

          {/* Filter bar */}
          {!loading && results.length > 0 && (
            <FilterBar
              results={results}
              onFilteredResults={handleFilteredResults}
              radius={radius}
              onRadiusChange={handleRadiusChange}
            />
          )}
        </div>
      </div>

      {/* Content section — split view on desktop, toggle on mobile */}
      <div className="max-w-5xl mx-auto lg:max-w-7xl mt-2">
        <div className="lg:flex lg:gap-4">
          {/* Left column: Results list */}
          <div
            className={`lg:w-1/2 lg:overflow-y-auto lg:pr-2 ${
              view === "map" ? "hidden lg:block" : ""
            }`}
            style={{ maxHeight: "calc(100vh - 200px)" }}
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
            style={{ height: "calc(100vh - 200px)" }}
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
