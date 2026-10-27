"use client";

import { useMemo } from "react";
import type { CPTCode, ChargeResult } from "@/types";
import { displayName, formatDistance, formatPrice } from "@/lib/format";
import { getCostContext } from "@/lib/cost-context";
import type { AnswerSummary, FeeScope } from "@/lib/results/summarize";
import { describeEpisode } from "@/lib/results/episode-display";
import { CopyButton } from "./CopyButton";
import { EpisodeEstimateRows } from "./EpisodeEstimateRows";
import { NotifyMe } from "./NotifyMe";

interface AnswerCardProps {
  summary: AnswerSummary;
  codes: CPTCode[];
  results: ChargeResult[];
  interpretation: string;
  locationDisplay: string;
  /** Inpatient state: reveal the line items we did find. */
  onShowLines?: () => void;
  linesShown?: boolean;
}

const MAIN_LINE_LABEL: Record<FeeScope, string> = {
  facility: "Hospital's fee",
  professional: "Doctor's fee",
  complete: "Hospital and doctor fees",
  unknown: "Fee coverage not specified",
};

function range(low?: number, high?: number): string {
  if (low == null) return "—";
  if (high == null || high === low) return formatPrice(low);
  return `${formatPrice(low)} – ${formatPrice(high)}`;
}

function place(locationDisplay: string): string {
  return locationDisplay ? `near ${locationDisplay}` : "near you";
}

function Interpretation({ text }: { text: string }) {
  if (!text) return null;
  return (
    <details className="group mt-4">
      <summary
        className="inline-flex items-center gap-1 text-[13px] font-medium cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        style={{ color: "var(--cc-primary)" }}
      >
        What we&rsquo;re pricing
        <svg
          className="w-3.5 h-3.5 transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <p
        className="mt-2 text-[13px] leading-relaxed"
        style={{ color: "var(--cc-text-secondary)" }}
      >
        {text}
      </p>
    </details>
  );
}

function Headline({
  eyebrow,
  figure,
  children,
}: {
  eyebrow: string;
  figure: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 pt-5 pb-4 sm:px-6">
      <h1
        className="text-[13px] font-medium"
        style={{ color: "var(--cc-text-secondary)" }}
      >
        {eyebrow}
      </h1>
      <p
        className="num text-[40px] sm:text-[48px] leading-[1.05] mt-1"
        style={{
          fontFamily: "var(--font-instrument-serif), Georgia, serif",
          color: "var(--cc-text)",
        }}
      >
        {figure}
      </p>
      {children}
    </div>
  );
}

export function AnswerCard({
  summary,
  codes,
  results,
  interpretation,
  locationDisplay,
  onShowLines,
  linesShown,
}: AnswerCardProps) {
  const extras = useMemo(
    () => getCostContext(codes, results)?.estimates ?? [],
    [codes, results]
  );

  const medicare = results.find(
    (r) => r.medicareFacilityRate != null
  )?.medicareFacilityRate;
  const episode = describeEpisode(summary.lowest?.primary.episodeEstimate);
  const shell = "rounded-2xl border overflow-hidden";
  const shellStyle = {
    background: "var(--cc-surface)",
    borderColor: "var(--cc-border-strong)",
  };

  // -- Billed as a hospital stay: say we can't price it ---------------------
  if (summary.state === "inpatient_unpriced") {
    const isBypass = summary.inpatientLabel === "heart bypass surgery";
    const questions = [
      "What is your self-pay price for the whole hospital stay? Please send me a written Good Faith Estimate.",
      `Which MS-DRG do you expect to bill${isBypass ? " (bypass surgery is usually MS-DRG 231 to 236)" : ""}?`,
      "Are the surgeon, anesthesia and other doctors' fees included, or billed separately?",
      "Do you offer a self-pay discount or a payment plan?",
    ];
    return (
      <section className={shell} style={shellStyle} aria-label="Price answer">
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <p
            className="text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--cc-accent)" }}
          >
            No reliable total yet
          </p>
          <h1
            className="text-[26px] sm:text-[30px] leading-tight mt-1"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            We can&rsquo;t price {summary.inpatientLabel} reliably yet.
          </h1>
          <p
            className="mt-2 text-[15px] leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            It&rsquo;s billed as a hospital stay of several days. The hospital
            price files we have list single lines for it, often just the
            surgeon&rsquo;s fee, so any number here would understate what
            you&rsquo;d pay.
          </p>
        </div>
        <div className="px-5 pb-5 sm:px-6">
          <div className="slip">
            <div className="slip-row">
              <span>Single lines we found {place(locationDisplay)}</span>
              <span>
                {range(summary.low, summary.high)}
                <span className="slip-note">not the full cost</span>
              </span>
            </div>
            <div className="slip-row">
              <span>Hospital stay</span>
              <span style={{ color: "var(--cc-text-tertiary)" }}>
                Not available
              </span>
            </div>
          </div>
          <div className="mt-4">
            <p
              className="text-sm font-semibold mb-2"
              style={{ color: "var(--cc-text)" }}
            >
              What to ask the hospital
            </p>
            <ol
              className="list-decimal pl-5 space-y-1.5 text-[14px]"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              {questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 mt-4">
              <CopyButton
                text={questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
                label="Copy the questions"
              />
              {onShowLines && summary.entries.length > 0 && (
                <button
                  type="button"
                  onClick={onShowLines}
                  className="text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--cc-surface-alt)]"
                  style={{ color: "var(--cc-text-secondary)" }}
                  aria-expanded={linesShown}
                >
                  {linesShown ? "Hide" : "Show"} the lines by hospital
                </button>
              )}
            </div>
          </div>
          <NotifyMe
            procedureName={summary.inpatientLabel ?? "this procedure"}
            procedureCode={codes[0]?.code}
          />
          <Interpretation text={interpretation} />
        </div>
      </section>
    );
  }

  if (summary.state === "no_prices") return null;

  // -- Priced (or doctor's fees only) ---------------------------------------
  const doctorOnly = summary.state === "doctor_fees_only";
  const basisWord = summary.estimated
    ? "Visit estimates"
    : summary.basis === "cash"
      ? "Cash prices"
      : summary.basis === "insured"
        ? "Average insured prices"
        : "Prices";
  const eyebrow = doctorOnly
    ? `Doctors' fees ${place(locationDisplay)}`
    : summary.stayDrg
      ? `${basisWord} for the hospital stay (MS-DRG ${summary.stayDrg}, no major complications) ${place(locationDisplay)}`
      : `${basisWord} ${place(locationDisplay)}`;
  const lowest = summary.lowest;
  const count = summary.rangeCount ?? summary.priced.length;

  return (
    <section className={shell} style={shellStyle} aria-label="Price answer">
      <Headline eyebrow={eyebrow} figure={range(summary.low, summary.high)}>
        <p
          className="mt-2 text-[15px] leading-relaxed"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          {lowest && (
            <>
              {summary.estimated
                ? "Lowest visit estimate is at "
                : "Lowest comparable published price is at "}
              <strong style={{ color: "var(--cc-text)", fontWeight: 600 }}>
                {displayName(lowest.primary.provider.name)}
              </strong>
              {lowest.primary.distanceMiles != null &&
                `, ${formatDistance(lowest.primary.distanceMiles)} away`}
              .{" "}
            </>
          )}
          {count >= 3 && summary.median != null && (
            <>
              The middle price across {count} places is{" "}
              <span className="num">{formatPrice(summary.median)}</span>.
            </>
          )}
          {summary.rangeCount != null &&
            summary.rangeCount < summary.entries.length &&
            " The range compares matching price types and fee coverage. Other available prices are listed below."}
          {summary.estimated &&
            " These are estimates from visit prices, not published quotes for your care."}
        </p>
      </Headline>

      <div className="px-5 pb-5 sm:px-6">
        <div className="slip">
          <div className="slip-row">
            <span>{MAIN_LINE_LABEL[summary.scope ?? "complete"]}</span>
            <span>{range(summary.low, summary.high)}</span>
          </div>
          {doctorOnly ? (
            <div className="slip-row">
              <span>Hospital or facility fee</span>
              <span style={{ color: "var(--cc-accent)" }}>
                Billed separately
                <span className="slip-note">not in these files</span>
              </span>
            </div>
          ) : (
            summary.scope === "facility" &&
            extras.map((e) => (
              <div className="slip-row" key={e.label}>
                <span>{e.label}</span>
                <span>
                  {range(e.low, e.high)}
                  <span className="slip-note">
                    rough estimate, billed separately
                  </span>
                </span>
              </div>
            ))
          )}
          {summary.scope === "facility" &&
            extras.length === 0 &&
            !doctorOnly && (
              <div className="slip-row">
                <span>Doctor&rsquo;s fee</span>
                <span style={{ color: "var(--cc-accent)" }}>
                  Billed separately
                </span>
              </div>
            )}
          {medicare != null && (
            <div className="slip-row">
              <span>For comparison: Medicare pays the doctor</span>
              <span>{formatPrice(medicare)}</span>
            </div>
          )}
          {episode && lowest && (
            <EpisodeEstimateRows
              display={episode}
              at={displayName(lowest.primary.provider.name)}
            />
          )}
        </div>
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          From the price files hospitals must publish. Call to confirm before
          you book.
        </p>
        <Interpretation text={interpretation} />
      </div>
    </section>
  );
}
