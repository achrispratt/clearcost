const CATEGORIES = [
  {
    name: "Imaging",
    examples: "MRI, CT, X-ray, ultrasound, mammogram",
    query: "Knee MRI",
  },
  {
    name: "Lab tests",
    examples: "Blood work, metabolic panels, screenings",
    query: "Blood work",
  },
  {
    name: "Surgery",
    examples: "Joint replacement, hernia repair, gallbladder",
    query: "Knee replacement surgery",
  },
  {
    name: "Office visits",
    examples: "New patient, specialist, follow-up",
    query: "New patient office visit",
  },
  {
    name: "Therapy",
    examples: "Physical and occupational therapy",
    query: "Physical therapy session",
  },
  {
    name: "Heart tests",
    examples: "Echocardiogram, stress test, ECG",
    query: "Echocardiogram",
  },
];

export function WhatYouCanSearch({
  onPick,
}: {
  onPick: (query: string) => void;
}) {
  return (
    <section
      id="what-you-can-search"
      className="scroll-mt-16 border-t px-4 lg:px-6 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
      }}
    >
      <div className="max-w-[1120px] mx-auto">
        <h2
          className="text-[34px] sm:text-[40px] leading-[1.1]"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          What you can price
        </h2>
        <p
          className="mt-3 mb-8 text-[16px] max-w-xl"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          About 1,000 common procedures, tests and visits at more than 5,400
          U.S. hospitals.
        </p>
        <ul
          className="grid sm:grid-cols-2 gap-x-12 border-t"
          style={{ borderColor: "var(--cc-border)" }}
        >
          {CATEGORIES.map((c) => (
            <li
              key={c.name}
              className="border-b"
              style={{ borderColor: "var(--cc-border)" }}
            >
              <button
                type="button"
                onClick={() => onPick(c.query)}
                className="group w-full flex items-center justify-between gap-4 py-4 text-left"
              >
                <span className="min-w-0">
                  <span
                    className="block text-[16px] font-semibold"
                    style={{ color: "var(--cc-text)" }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="block text-[14px]"
                    style={{ color: "var(--cc-text-secondary)" }}
                  >
                    {c.examples}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[13px] font-semibold group-hover:underline"
                  style={{ color: "var(--cc-primary)" }}
                >
                  Ask &rarr;
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
