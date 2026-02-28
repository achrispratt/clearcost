"use client";

import { Suspense } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ClarificationStep } from "@/components/ClarificationStep";
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import { useClarificationState } from "./useClarificationState";

function GuidedSearchContent() {
  const {
    query,
    lat,
    lng,
    locationDisplay,
    turns,
    currentQuestion,
    phase,
    loading,
    error,
    selectedOption,
    freeText,
    handleSubmit,
    handleBack,
    handleBreadcrumbClick,
    handleQueryBreadcrumbClick,
    handleSkip,
    handleNewSearch,
    handleOptionSelect,
    handleFreeTextChange,
  } = useClarificationState();

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      {/* Compact search bar */}
      <SearchBar
        onSearch={handleNewSearch}
        loading={loading}
        initialQuery={query}
        initialLocation={lat && lng ? { lat, lng, display: locationDisplay } : undefined}
        compact
      />

      {/* Loading state — initial assessment */}
      {phase === "loading" && loading && (
        <div className="mt-12 flex flex-col items-center animate-fade-in">
          <svg
            className="w-6 h-6 animate-spin mb-4"
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
          <p
            className="text-sm"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Understanding your query...
          </p>
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
          <button
            onClick={handleSkip}
            className="mt-2 text-sm font-medium underline"
            style={{ color: "var(--cc-primary)" }}
          >
            Skip to results
          </button>
        </div>
      )}

      {/* Clarifying phase */}
      {phase === "clarifying" && (
        <div className="mt-6">
          <BreadcrumbTrail
            query={query}
            turns={turns}
            loading={loading}
            onQueryClick={handleQueryBreadcrumbClick}
            onBreadcrumbClick={handleBreadcrumbClick}
          />

          {/* Current question */}
          {currentQuestion && (
            <ClarificationStep
              question={currentQuestion}
              selectedOption={selectedOption}
              freeText={freeText}
              onSelect={handleOptionSelect}
              onFreeTextChange={handleFreeTextChange}
              onSubmit={handleSubmit}
              onBack={handleBack}
              backLabel={turns.length === 0 ? "Back to search" : "Previous"}
              isTerminal={turns.length >= 5}
              loading={loading}
            />
          )}

          {/* Skip link */}
          <div className="mt-6 text-center">
            <button
              onClick={handleSkip}
              className="text-xs underline transition-colors"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              Skip — show all results
            </button>
          </div>

          {/* Disclaimer */}
          <p
            className="mt-8 text-xs text-center leading-relaxed"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            This tool helps you find pricing, not diagnose conditions.
            Always consult a healthcare provider for medical advice.
          </p>
        </div>
      )}
    </div>
  );
}

export default function GuidedSearchPage() {
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
      <GuidedSearchContent />
    </Suspense>
  );
}
