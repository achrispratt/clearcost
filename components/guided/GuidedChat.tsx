"use client";

import { useEffect, useRef, useState } from "react";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import type { ClarificationQuestion, ClarificationTurn } from "@/types";

interface GuidedChatProps {
  query: string;
  turns: ClarificationTurn[];
  askedQuestions: ClarificationQuestion[];
  currentQuestion: ClarificationQuestion | null;
  loading: boolean;
  onAnswer: (label: string) => void;
  onFreeText: (text: string) => void;
  onEditTurn: (index: number) => void;
}

/** Expected length of a guided search; the prompt targets at most 6 turns. */
const TYPICAL_QUESTIONS = 4;

function AssistantBubble({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className="max-w-[92%] sm:max-w-[80%] rounded-[4px_16px_16px_16px] border px-4 py-3"
      style={{
        background: "var(--cc-surface)",
        borderColor: "var(--cc-border)",
        color: muted ? "var(--cc-text-secondary)" : "var(--cc-text)",
      }}
    >
      {children}
    </div>
  );
}

function UserBubble({
  children,
  onEdit,
  disabled,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <span
      className="inline-block max-w-full rounded-[16px_4px_16px_16px] px-4 py-2 text-[15px] text-white text-left"
      style={{ background: "var(--cc-primary)" }}
    >
      {children}
    </span>
  );
  return (
    <div className="flex justify-end items-center gap-2">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="text-[12px] font-medium px-2 py-1 rounded-md disabled:opacity-40 hover:bg-[var(--cc-surface-alt)]"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          Change
        </button>
      )}
      <div className="max-w-[85%] sm:max-w-[75%] text-right">{body}</div>
    </div>
  );
}

function Typing() {
  return (
    <div
      className="self-start inline-flex gap-1 rounded-[4px_16px_16px_16px] border px-4 py-3.5"
      style={{
        background: "var(--cc-surface)",
        borderColor: "var(--cc-border)",
      }}
      aria-label="Thinking"
      role="status"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full animate-pulse-subtle"
          style={{
            background: "var(--cc-text-tertiary)",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function CurrentQuestion({
  question,
  onAnswer,
  onFreeText,
}: {
  question: ClarificationQuestion;
  onAnswer: (label: string) => void;
  onFreeText: (text: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");

  return (
    <div className="flex flex-col gap-3 animate-fade-up">
      <AssistantBubble>
        <h1
          className="text-[22px] sm:text-[24px] leading-snug"
          style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}
        >
          {question.question}
        </h1>
        {question.helpText && (
          <p
            className="text-[14px] mt-1.5"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            {question.helpText}
          </p>
        )}
      </AssistantBubble>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:pl-6">
        {question.options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => onAnswer(option.label)}
            className="text-left rounded-xl border px-4 py-3 min-h-[48px] transition-colors hover:border-[var(--cc-primary)] hover:bg-[var(--cc-primary-light)] focus-ring"
            style={{
              background: "var(--cc-surface)",
              borderColor: "var(--cc-border)",
            }}
          >
            <span
              className="block text-[15px] font-semibold"
              style={{ color: "var(--cc-text)" }}
            >
              {option.label}
            </span>
            {option.description && (
              <span
                className="block text-[13px] mt-0.5 leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                {option.description}
              </span>
            )}
          </button>
        ))}
      </div>

      {question.allowFreeText !== false && (
        <div className="sm:pl-6">
          {typing ? (
            <form
              className="flex items-center gap-2 rounded-xl border pl-4 pr-1.5 py-1.5 search-container"
              style={{
                background: "var(--cc-surface)",
                borderColor: "var(--cc-border)",
              }}
              onSubmit={(e) => {
                e.preventDefault();
                onFreeText(text);
              }}
            >
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Describe it in your own words"
                className="flex-1 min-w-0 bg-transparent text-[15px] py-1.5 focus:outline-none"
                style={{ color: "var(--cc-text)" }}
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--cc-primary)" }}
              >
                Send
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="text-[13px] font-medium underline underline-offset-2"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              None of these? Type your answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function GuidedChat({
  query,
  turns,
  askedQuestions,
  currentQuestion,
  loading,
  onAnswer,
  onFreeText,
  onEditTurn,
}: GuidedChatProps) {
  const questionRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  // Bring each new question to the top of the screen; on a phone the old
  // scroll position otherwise leaves it below the fold.
  useEffect(() => {
    if (loading) {
      tailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (currentQuestion && turns.length > 0) {
      questionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [currentQuestion, loading, turns.length]);

  const answered = Math.min(turns.length, TYPICAL_QUESTIONS);
  const total = Math.max(TYPICAL_QUESTIONS, turns.length + 1);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex gap-1 mb-2"
        aria-label={`Question ${turns.length + 1}`}
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="h-[3px] flex-1 rounded-full transition-colors"
            style={{
              background:
                i < turns.length ? "var(--cc-primary)" : "var(--cc-border)",
            }}
          />
        ))}
      </div>

      <UserBubble>{query}</UserBubble>
      <EmergencyBanner texts={[query, ...turns.map((t) => t.freeText)]} />

      {turns.map((turn, i) => {
        const q = askedQuestions[i];
        return (
          <div key={`${turn.questionId}-${i}`} className="flex flex-col gap-3">
            {q && (
              <AssistantBubble muted>
                <p className="text-[14px]">{q.question}</p>
              </AssistantBubble>
            )}
            <UserBubble onEdit={() => onEditTurn(i)} disabled={loading}>
              {turn.freeText || turn.selectedOption}
            </UserBubble>
          </div>
        );
      })}

      {loading && <Typing />}

      {!loading && currentQuestion && (
        <div ref={questionRef} className="scroll-mt-20">
          <CurrentQuestion
            key={`${currentQuestion.id}-${turns.length}`}
            question={currentQuestion}
            onAnswer={onAnswer}
            onFreeText={onFreeText}
          />
        </div>
      )}
      <div ref={tailRef} />
    </div>
  );
}
