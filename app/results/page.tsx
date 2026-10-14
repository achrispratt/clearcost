"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { QueryPill } from "@/components/QueryPill";
import { FilterBar } from "@/components/FilterBar";
import { MapView } from "@/components/MapView";
import { SaveButton } from "@/components/SaveButton";
import { AnswerCard } from "@/components/results/AnswerCard";
import { CodesDrawer } from "@/components/results/CodesDrawer";
import {
  HospitalList,
  HospitalListSkeleton,
} from "@/components/results/HospitalList";
import { summarizeAnswer } from "@/lib/results/summarize";
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
    handleNewSearch,
    handleFilteredResults,
    radius,
    handleRadiusChange,
    logResultClick,
    logSaveSearch,
  } = useResultsSearch();

  const {
    selectedProviderId,
    markerClickCount,
    handleMarkerClick,
    handleCardSelect,
  } = useResultSelection();

  const [mapOpen, setMapOpen] = useState(false);

  // Arriving from the guided chat keeps its scroll position; start at the
  // answer instead.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // The phone map covers the page; stop the list scrolling underneath it.
  useEffect(() => {
    if (!mapOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mapOpen]);
  const [linesShown, setLinesShown] = useState(false);

  const summary = useMemo(
    () => summarizeAnswer(filteredResults, cptCodes),
    [filteredResults, cptCodes]
  );

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

  const onMarkerClick = useCallback(
    (providerId: string) => {
      handleMarkerClick(providerId);
      setMapOpen(false);
    },
    [handleMarkerClick]
  );

  const inpatient = summary.state === "inpatient_unpriced";
  const showList = !inpatient || linesShown;
  const hospitalCount = summary.entries.length;
  const canExpand = radius < 250;

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 pt-4 pb-24 lg:pb-10">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:gap-6">
        {/* Answer + hospitals */}
        <div className="min-w-0 space-y-4">
          <QueryPill
            query={query}
            location={
              lat && lng ? { lat, lng, display: locationDisplay } : undefined
            }
            loading={loading}
            onSearch={handleNewSearch}
          />

          {error && (
            <div
              className="p-3 rounded-lg border"
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

          {loading ? (
            <HospitalListSkeleton />
          ) : (
            !error && (
              <>
                <AnswerCard
                  summary={summary}
                  codes={cptCodes}
                  results={filteredResults}
                  interpretation={interpretation}
                  locationDisplay={locationDisplay}
                  onShowLines={() => setLinesShown((v) => !v)}
                  linesShown={linesShown}
                />

                <CodesDrawer codes={cptCodes} />

                {results.length > 0 && showList && (
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
                      <h2
                        className="text-[22px] leading-tight mr-auto"
                        style={{
                          fontFamily:
                            "var(--font-instrument-serif), Georgia, serif",
                          color: "var(--cc-text)",
                        }}
                      >
                        {hospitalCount}{" "}
                        {hospitalCount === 1 ? "place" : "places"} nearby
                      </h2>
                      <SaveButton
                        query={query}
                        location={locationDisplay}
                        cptCodes={cptCodes.map((c) => c.code)}
                        lat={lat}
                        lng={lng}
                        onSave={logSaveSearch}
                      />
                    </div>
                    <FilterBar
                      results={results}
                      onFilteredResults={handleFilteredResults}
                      radius={radius}
                      onRadiusChange={handleRadiusChange}
                    />
                  </div>
                )}

                {showList && filteredResults.length > 0 && (
                  <HospitalList
                    entries={summary.entries}
                    lowestId={summary.lowest?.primary.id}
                    selectedProviderId={selectedProviderId}
                    markerClickCount={markerClickCount}
                    onCardSelect={handleCardSelect}
                    onResultClick={logResultClick}
                  />
                )}

                {filteredResults.length > 0 &&
                  hospitalCount < 3 &&
                  canExpand &&
                  showList && (
                    <p
                      className="text-sm"
                      style={{ color: "var(--cc-text-secondary)" }}
                    >
                      Only {hospitalCount} found.{" "}
                      <button
                        type="button"
                        onClick={handleExpandRadius}
                        className="font-semibold underline"
                        style={{ color: "var(--cc-primary)" }}
                      >
                        Look farther away
                      </button>
                    </p>
                  )}

                {filteredResults.length === 0 && (
                  <div
                    className="rounded-2xl border px-5 py-8"
                    style={{
                      background: "var(--cc-surface)",
                      borderColor: "var(--cc-border)",
                    }}
                  >
                    <p
                      className="text-[26px] leading-tight"
                      style={{
                        fontFamily:
                          "var(--font-instrument-serif), Georgia, serif",
                        color: "var(--cc-text)",
                      }}
                    >
                      No prices found
                      {locationDisplay ? ` near ${locationDisplay}` : ""}.
                    </p>
                    <p
                      className="mt-2 text-[15px]"
                      style={{ color: "var(--cc-text-secondary)" }}
                    >
                      Hospitals nearby haven&rsquo;t published a price for this
                      yet, or it&rsquo;s outside the area you picked.
                    </p>
                    {canExpand && (
                      <button
                        type="button"
                        onClick={handleExpandRadius}
                        className="mt-4 text-sm font-semibold px-4 py-2 rounded-lg text-white"
                        style={{ background: "var(--cc-primary)" }}
                      >
                        Look farther away
                      </button>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Desktop map: a tool beside the answer, not the page */}
        <aside className="hidden lg:block min-w-0">
          <div
            className="sticky top-[72px] rounded-xl overflow-hidden border"
            style={{
              height: "calc(100vh - 96px)",
              borderColor: "var(--cc-border)",
            }}
          >
            <MapView
              results={filteredResults}
              center={{ lat, lng }}
              onMarkerClick={handleMarkerClick}
              selectedProviderId={selectedProviderId}
              className="h-full"
            />
          </div>
        </aside>
      </div>

      {/* Phone map: a full-screen sheet behind one button */}
      {!loading && filteredResults.length > 0 && showList && !mapOpen && (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ background: "var(--cc-text)" }}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Map
        </button>
      )}
      {mapOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[60] flex flex-col animate-fade-in"
          style={{ background: "var(--cc-bg)" }}
          role="dialog"
          aria-label="Map of hospitals"
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--cc-border)" }}
          >
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--cc-text)" }}
            >
              {hospitalCount} {hospitalCount === 1 ? "place" : "places"} nearby
            </span>
            <button
              type="button"
              onClick={() => setMapOpen(false)}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg"
              style={{ color: "var(--cc-primary)" }}
            >
              Back to list
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <MapView
              results={filteredResults}
              center={{ lat, lng }}
              onMarkerClick={onMarkerClick}
              selectedProviderId={selectedProviderId}
              className="h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-[1440px] mx-auto px-4 lg:px-6 pt-4">
          <HospitalListSkeleton />
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
