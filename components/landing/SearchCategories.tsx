import Link from "next/link";
import { AnimateOnScroll } from "./AnimateOnScroll";
import { formatApproxCount } from "@/lib/format";

const categories = [
  {
    name: "Imaging",
    examples: "MRIs, CT scans, X-rays, ultrasounds",
    query: "knee MRI",
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
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    name: "Lab Tests",
    examples: "Blood work, metabolic panels, screenings",
    query: "blood test",
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
        <path d="M9 2v6.5l-4.5 8A2 2 0 0 0 6.3 20h11.4a2 2 0 0 0 1.8-3.5L15 8.5V2" />
        <path d="M8 2h8" />
        <path d="M7 16h10" />
      </svg>
    ),
  },
  {
    name: "Surgery",
    examples: "Joint replacement, hernia repair, appendectomy",
    query: "knee replacement surgery",
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
        <path d="m18.5 5.5-12 12" />
        <path d="M5 18.5 2 21" />
        <path d="M21 3l-3 2.5" />
        <path d="m14.5 11.5 3-3" />
        <path d="m9.5 16.5-3 3" />
      </svg>
    ),
  },
  {
    name: "Office Visits",
    examples: "New patient, specialist, follow-up",
    query: "new patient office visit",
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
        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
        <path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" />
        <circle cx="20" cy="10" r="2" />
      </svg>
    ),
  },
  {
    name: "Therapy",
    examples: "Physical therapy, occupational therapy",
    query: "physical therapy session",
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
        <circle cx="12" cy="5" r="3" />
        <path d="M12 8v4" />
        <path d="m8 16 4-4 4 4" />
        <path d="M8 20h8" />
      </svg>
    ),
  },
  {
    name: "Heart & Vascular",
    examples: "Cardiac imaging, stress tests, ECG",
    query: "echocardiogram",
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
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
      </svg>
    ),
  },
];

export function SearchCategories() {
  return (
    <section
      id="what-you-can-search"
      className="border-t px-4 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-bg)",
      }}
    >
      <div className="max-w-5xl mx-auto">
        <AnimateOnScroll>
          <div className="text-center mb-12">
            <h2
              className="text-center text-sm font-semibold tracking-widest uppercase mb-3"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              What You Can Search
            </h2>
            <p
              className="text-base"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              {formatApproxCount(1000)} procedures and growing
            </p>
          </div>
        </AnimateOnScroll>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
          {categories.map((cat, i) => (
            <AnimateOnScroll key={cat.name} delay={i * 0.08}>
              <Link
                href={`/guided-search?q=${encodeURIComponent(cat.query)}`}
                className="block rounded-xl p-5 card-hover group"
                style={{
                  border: "1px solid var(--cc-border)",
                  background: "var(--cc-surface)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: "var(--cc-primary-light)",
                    color: "var(--cc-primary)",
                  }}
                >
                  {cat.icon}
                </div>
                <h3
                  className="font-semibold text-base mb-1"
                  style={{ color: "var(--cc-text)" }}
                >
                  {cat.name}
                </h3>
                <p
                  className="text-sm leading-relaxed mb-3"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {cat.examples}
                </p>
                <span
                  className="text-xs font-medium inline-flex items-center gap-1 group-hover:gap-2 transition-all"
                  style={{ color: "var(--cc-primary)" }}
                >
                  Try it
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </span>
              </Link>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
