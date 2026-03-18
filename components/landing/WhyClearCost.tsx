import { AnimateOnScroll } from "./AnimateOnScroll";
import { formatApproxCount } from "@/lib/format";

export function WhyClearCost() {
  const trustSignals = [
    {
      label: "Data from hospital-published MRFs",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      ),
    },
    {
      label: "Required by CMS since 2021",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </svg>
      ),
    },
    {
      label: `${formatApproxCount(5400)} hospitals nationwide`,
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 21h18" />
          <path d="M9 8h1" />
          <path d="M9 12h1" />
          <path d="M9 16h1" />
          <path d="M14 8h1" />
          <path d="M14 12h1" />
          <path d="M14 16h1" />
          <rect x="5" y="2" width="14" height="19" rx="1" />
        </svg>
      ),
    },
  ];

  return (
    <section
      aria-label="Why ClearCost Exists"
      className="border-t px-4 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-bg)",
      }}
    >
      <div className="max-w-4xl mx-auto">
        <AnimateOnScroll>
          <p
            className="text-center text-sm font-semibold tracking-widest uppercase mb-12"
            style={{ color: "var(--cc-text-tertiary)" }}
            aria-hidden="true"
          >
            Why ClearCost Exists
          </p>
        </AnimateOnScroll>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-10 sm:gap-12">
          {/* Narrative */}
          <AnimateOnScroll className="sm:col-span-3">
            <div className="space-y-5">
              <p
                className="text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Since 2021, federal law has required every hospital in the U.S.
                to publish their prices. It&rsquo;s called the{" "}
                <strong style={{ color: "var(--cc-text)" }}>
                  Hospital Price Transparency Rule
                </strong>
                , and it was a landmark shift toward giving patients the
                information they need to make informed decisions.
              </p>
              <p
                className="text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                The problem? The data is buried in massive machine-readable
                files &mdash; spreadsheets with millions of rows, designed for
                computers, not people. Most patients will never find them, let
                alone make sense of them.
              </p>
              <p
                className="text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                ClearCost aggregates this pricing data, normalizes it, and makes
                it searchable in plain English. We&rsquo;re building the
                interface that the transparency mandate was meant to enable.
              </p>
            </div>
          </AnimateOnScroll>

          {/* Trust signals card */}
          <AnimateOnScroll className="sm:col-span-2" delay={0.15}>
            <div
              className="rounded-xl p-6 space-y-5"
              style={{
                border: "1px solid var(--cc-border)",
                background: "var(--cc-surface)",
              }}
            >
              {trustSignals.map((signal, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                    }}
                  >
                    {signal.icon}
                  </div>
                  <span
                    className="text-sm font-medium leading-snug pt-1.5"
                    style={{ color: "var(--cc-text)" }}
                  >
                    {signal.label}
                  </span>
                </div>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  );
}
