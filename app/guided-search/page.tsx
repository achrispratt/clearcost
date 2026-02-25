"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { ClarificationStep } from "@/components/ClarificationStep";
import type {
  ClarificationTurn,
  ClarificationQuestion,
  CPTCode,
  TranslationResponse,
} from "@/types";

function GuidedSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const locationDisplay = searchParams.get("loc") || "";

  // Conversation state
  const [turns, setTurns] = useState<ClarificationTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] =
    useState<ClarificationQuestion | null>(null);
  const [allCodes, setAllCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [phase, setPhase] = useState<"loading" | "clarifying" | "resolved">(
    "loading"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current step input state
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");

  // Navigate to results with resolved codes
  const goToResults = useCallback(
    (codes: CPTCode[], interp: string) => {
      const codeValues = codes.map((c) => c.code);
      const codeType = codes[0]?.codeType || "cpt";
      const params = new URLSearchParams({
        q: query,
        lat: lat.toString(),
        lng: lng.toString(),
        loc: locationDisplay,
        codes: codeValues.join(","),
        codeType,
        interp: interp,
      });
      router.push(`/results?${params.toString()}`);
    },
    [query, lat, lng, locationDisplay, router]
  );

  // Handle API response — either show next question or resolve
  const handleResponse = useCallback(
    (data: TranslationResponse) => {
      setInterpretation(data.interpretation || "");

      if (data.codes && data.codes.length > 0) {
        setAllCodes(data.codes);
      }

      if (
        data.confidence === "high" ||
        data.conversationComplete
      ) {
        if (data.codes && data.codes.length > 0) {
          goToResults(data.codes, data.interpretation || "");
        } else {
          // Fallback: go to results with query-based search
          const params = new URLSearchParams({
            q: query,
            lat: lat.toString(),
            lng: lng.toString(),
            loc: locationDisplay,
          });
          router.push(`/results?${params.toString()}`);
        }
        return;
      }

      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setPhase("clarifying");
        setSelectedOption(null);
        setFreeText("");
      } else {
        // No question and not complete — fallback to results
        const params = new URLSearchParams({
          q: query,
          lat: lat.toString(),
          lng: lng.toString(),
          loc: locationDisplay,
        });
        router.push(`/results?${params.toString()}`);
      }
    },
    [goToResults, query, lat, lng, locationDisplay, router]
  );

  // Initial assessment on mount
  useEffect(() => {
    if (!query || !lat || !lng) return;

    const assess = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, turns: [] }),
        });

        if (!response.ok) {
          throw new Error("Failed to assess query");
        }

        const data: TranslationResponse = await response.json();
        handleResponse(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
        setPhase("clarifying");
      } finally {
        setLoading(false);
      }
    };

    assess();
  }, [query, lat, lng, handleResponse]);

  // Submit current answer and get next question
  const handleSubmit = async () => {
    if (!currentQuestion) return;
    if (!selectedOption && !freeText.trim()) return;

    const newTurn: ClarificationTurn = {
      questionId: currentQuestion.id,
      selectedOption: freeText.trim() ? "other" : selectedOption || "",
      freeText: freeText.trim() || undefined,
    };

    const updatedTurns = [...turns, newTurn];
    setTurns(updatedTurns);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, turns: updatedTurns }),
      });

      if (!response.ok) {
        throw new Error("Failed to get next question");
      }

      const data: TranslationResponse = await response.json();
      handleResponse(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
    }
  };

  // Go back to previous question
  const handleBack = () => {
    if (turns.length === 0) {
      // Go back to home
      router.push("/");
      return;
    }

    // Remove last turn and re-ask from that point
    const previousTurns = turns.slice(0, -1);
    setTurns(previousTurns);
    setSelectedOption(null);
    setFreeText("");

    // Re-fetch from the previous state
    const refetch = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, turns: previousTurns }),
        });
        if (response.ok) {
          const data: TranslationResponse = await response.json();
          if (data.nextQuestion) {
            setCurrentQuestion(data.nextQuestion);
          }
        }
      } catch {
        // Keep current question on error
      } finally {
        setLoading(false);
      }
    };
    refetch();
  };

  // Skip clarification — go to results with whatever we have
  const handleSkip = () => {
    if (allCodes.length > 0) {
      goToResults(allCodes, interpretation);
    } else {
      const params = new URLSearchParams({
        q: query,
        lat: lat.toString(),
        lng: lng.toString(),
        loc: locationDisplay,
      });
      router.push(`/results?${params.toString()}`);
    }
  };

  // Handle new search
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
    router.push(`/guided-search?${params.toString()}`);
  };

  // Mutual exclusion: selecting card clears free text
  const handleOptionSelect = (label: string) => {
    setSelectedOption(label);
    setFreeText("");
  };

  // Mutual exclusion: typing clears card selection
  const handleFreeTextChange = (value: string) => {
    setFreeText(value);
    if (value.trim()) {
      setSelectedOption(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      {/* Compact search bar */}
      <SearchBar
        onSearch={handleNewSearch}
        loading={loading}
        initialQuery={query}
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
          {/* Breadcrumb: previous answers */}
          {turns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-6 animate-fade-in">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--cc-text-tertiary)" }}
              >
                {query}
              </span>
              {turns.map((turn, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3"
                    style={{ color: "var(--cc-text-tertiary)" }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span
                    className="text-xs px-2 py-0.5 rounded-md"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                      fontWeight: 500,
                    }}
                  >
                    {turn.freeText || turn.selectedOption}
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Back button */}
          <button
            onClick={handleBack}
            disabled={loading}
            className="flex items-center gap-1.5 mb-4 text-sm transition-colors"
            style={{
              color: "var(--cc-text-secondary)",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {turns.length === 0 ? "Back to search" : "Previous question"}
          </button>

          {/* Current question */}
          {currentQuestion && (
            <ClarificationStep
              question={currentQuestion}
              selectedOption={selectedOption}
              freeText={freeText}
              onSelect={handleOptionSelect}
              onFreeTextChange={handleFreeTextChange}
              onSubmit={handleSubmit}
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
