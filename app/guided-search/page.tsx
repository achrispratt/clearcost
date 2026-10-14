"use client";

import { Suspense } from "react";
import { QueryPill } from "@/components/QueryPill";
import { GuidedChat } from "@/components/guided/GuidedChat";
import { useClarificationState } from "./useClarificationState";

function GuidedSearchContent() {
  const {
    query,
    lat,
    lng,
    locationDisplay,
    turns,
    askedQuestions,
    currentQuestion,
    phase,
    loading,
    error,
    handleAnswer,
    handleFreeTextAnswer,
    handleEditTurn,
    handleSkip,
    handleNewSearch,
  } = useClarificationState();

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-16">
      <QueryPill
        query={query}
        location={
          lat && lng ? { lat, lng, display: locationDisplay } : undefined
        }
        loading={loading}
        onSearch={handleNewSearch}
      />

      <div className="mt-6">
        {phase === "loading" && loading && (
          <GuidedChat
            query={query}
            turns={[]}
            askedQuestions={[]}
            currentQuestion={null}
            loading
            onAnswer={handleAnswer}
            onFreeText={handleFreeTextAnswer}
            onEditTurn={handleEditTurn}
          />
        )}

        {phase === "clarifying" && (
          <GuidedChat
            query={query}
            turns={turns}
            askedQuestions={askedQuestions}
            currentQuestion={currentQuestion}
            loading={loading}
            onAnswer={handleAnswer}
            onFreeText={handleFreeTextAnswer}
            onEditTurn={handleEditTurn}
          />
        )}

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

        {(phase === "clarifying" || error) && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-sm font-medium underline underline-offset-2"
              style={{ color: "var(--cc-primary)" }}
            >
              Skip the questions and show prices
            </button>
          </div>
        )}

        <p
          className="mt-10 text-[12px] leading-relaxed"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          These questions only find the right billing code for a price. They
          aren&rsquo;t medical advice. Talk to a doctor about your care.
        </p>
      </div>
    </div>
  );
}

export default function GuidedSearchPage() {
  return (
    <Suspense fallback={null}>
      <GuidedSearchContent />
    </Suspense>
  );
}
