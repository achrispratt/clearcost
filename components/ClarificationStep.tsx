"use client";

import type { ClarificationQuestion } from "@/types";

interface ClarificationStepProps {
  question: ClarificationQuestion;
  selectedOption: string | null;
  freeText: string;
  onSelect: (optionLabel: string) => void;
  onFreeTextChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  backLabel?: string;
  isTerminal: boolean;
  loading: boolean;
}

export function ClarificationStep({
  question,
  selectedOption,
  freeText,
  onSelect,
  onFreeTextChange,
  onSubmit,
  onBack,
  backLabel = "Previous",
  isTerminal,
  loading,
}: ClarificationStepProps) {
  const hasSelection = selectedOption !== null || freeText.trim().length > 0;

  return (
    <div className="animate-fade-up">
      {/* Question */}
      <h2
        className="text-xl sm:text-2xl leading-snug mb-2"
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          color: "var(--cc-text)",
        }}
      >
        {question.question}
      </h2>

      {/* Help text */}
      {question.helpText && (
        <p
          className="text-sm mb-5"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          {question.helpText}
        </p>
      )}

      {/* Option cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        {question.options.map((option) => {
          const isSelected = selectedOption === option.label;
          return (
            <button
              key={option.label}
              onClick={() => onSelect(option.label)}
              disabled={loading}
              className="text-left p-4 rounded-xl border min-h-[44px] transition-all duration-200 not-disabled:not-[[data-selected]]:hover:border-[var(--cc-border-strong)] not-disabled:not-[[data-selected]]:hover:bg-[var(--cc-surface-hover)]"
              style={{
                background: isSelected
                  ? "var(--cc-primary-light)"
                  : "var(--cc-surface)",
                borderColor: isSelected
                  ? "var(--cc-primary)"
                  : "var(--cc-border)",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
              data-selected={isSelected || undefined}
            >
              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <div
                  className="w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors"
                  style={{
                    borderColor: isSelected
                      ? "var(--cc-primary)"
                      : "var(--cc-border-strong)",
                  }}
                >
                  {isSelected && (
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "var(--cc-primary)" }}
                    />
                  )}
                </div>
                <div>
                  <span
                    className="font-semibold text-sm block"
                    style={{
                      color: isSelected
                        ? "var(--cc-primary)"
                        : "var(--cc-text)",
                    }}
                  >
                    {option.label}
                  </span>
                  {option.description && (
                    <span
                      className="text-xs mt-0.5 block leading-relaxed"
                      style={{ color: "var(--cc-text-secondary)" }}
                    >
                      {option.description}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Free text "Other" input */}
      {question.allowFreeText !== false && (
        <div className="mt-3">
          <textarea
            value={freeText}
            onChange={(e) => onFreeTextChange(e.target.value)}
            disabled={loading}
            placeholder="Or tell us more about what you need..."
            rows={2}
            className="w-full p-3 rounded-xl border text-sm resize-none transition-all duration-200 focus:border-[var(--cc-primary)] focus:shadow-[0_0_0_3px_var(--cc-primary-subtle)]"
            style={{
              background:
                freeText.trim().length > 0
                  ? "var(--cc-primary-light)"
                  : "var(--cc-surface)",
              borderColor:
                freeText.trim().length > 0
                  ? "var(--cc-primary)"
                  : "var(--cc-border)",
              color: "var(--cc-text)",
              outline: "none",
            }}
          />
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-5 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            disabled={loading}
            className="px-5 py-3 rounded-xl text-sm font-medium border min-h-[44px] transition-all duration-200 flex items-center gap-1.5"
            style={{
              borderColor: "var(--cc-border-strong)",
              color: loading
                ? "var(--cc-text-tertiary)"
                : "var(--cc-text-secondary)",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
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
            {backLabel}
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={!hasSelection || loading}
          className="px-6 py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-all duration-200 flex items-center gap-2"
          style={{
            background:
              hasSelection && !loading
                ? "var(--cc-primary)"
                : "var(--cc-border)",
            color:
              hasSelection && !loading ? "white" : "var(--cc-text-tertiary)",
            cursor: hasSelection && !loading ? "pointer" : "not-allowed",
          }}
        >
          {loading ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
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
              Thinking...
            </>
          ) : isTerminal ? (
            "Show Prices"
          ) : (
            "Next →"
          )}
        </button>
      </div>
    </div>
  );
}
