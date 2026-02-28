"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
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

  // Response cache for instant back-navigation (keyed by JSON.stringify(turns))
  const responseCache = useRef<Map<string, TranslationResponse>>(new Map());

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

  // Consolidated fetch: checks cache first, then calls API and caches the result
  const fetchOrCacheQuestion = useCallback(
    async (turnsArray: ClarificationTurn[]) => {
      const cacheKey = JSON.stringify(turnsArray);

      // Check cache first — instant restore for back-navigation
      const cached = responseCache.current.get(cacheKey);
      if (cached) {
        handleResponse(cached);
        return;
      }

      // Cache miss — call API
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, turns: turnsArray }),
        });

        if (!response.ok) {
          throw new Error("Failed to process query");
        }

        const data: TranslationResponse = await response.json();

        // Cache the response for future back-navigation
        responseCache.current.set(cacheKey, data);

        handleResponse(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
        setPhase("clarifying");
      } finally {
        setLoading(false);
      }
    },
    [query, handleResponse]
  );

  // Initial assessment on mount
  useEffect(() => {
    if (!query || !lat || !lng) return;
    fetchOrCacheQuestion([]);
  }, [query, lat, lng, fetchOrCacheQuestion]);

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
    fetchOrCacheQuestion(updatedTurns);
  };

  // Go back to previous question
  const handleBack = () => {
    if (turns.length === 0) {
      router.push("/");
      return;
    }

    const previousTurns = turns.slice(0, -1);
    setTurns(previousTurns);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion(previousTurns);
  };

  // Jump to a specific breadcrumb step (click on a previous answer)
  const handleBreadcrumbClick = (stepIndex: number) => {
    // stepIndex is the turn index — clicking it restores state after that turn
    // e.g., clicking step 0 means "go back to the question after turn 0"
    const targetTurns = turns.slice(0, stepIndex + 1);
    setTurns(targetTurns);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion(targetTurns);
  };

  // Jump back to initial question (click the query breadcrumb)
  const handleQueryBreadcrumbClick = () => {
    setTurns([]);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion([]);
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
          {/* Breadcrumb: previous answers (clickable) */}
          {turns.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-6 animate-fade-in">
              <button
                onClick={handleQueryBreadcrumbClick}
                disabled={loading}
                className="text-xs font-medium transition-colors hover:underline"
                style={{
                  color: "var(--cc-text-tertiary)",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {query}
              </button>
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
                  <button
                    onClick={() => handleBreadcrumbClick(i)}
                    disabled={loading}
                    className="text-xs px-2 py-0.5 rounded-md transition-all hover:brightness-95"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                      fontWeight: 500,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {turn.freeText || turn.selectedOption}
                  </button>
                </span>
              ))}
            </div>
          )}

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
