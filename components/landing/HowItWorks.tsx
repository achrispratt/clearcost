import { AnimateOnScroll } from "./AnimateOnScroll";

export function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Search in plain English",
      desc: "Describe what you need. Our AI translates it into the exact billing codes hospitals use.",
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
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      ),
    },
    {
      num: "02",
      title: "Compare real prices",
      desc: "See actual cash prices from hospital pricing data, mandated by federal law since 2021.",
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
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      num: "03",
      title: "Find nearby providers",
      desc: "Map and list views help you find the best price at a convenient location near you.",
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
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
  ];

  return (
    <section
      id="how-it-works"
      className="border-t px-4 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
      }}
    >
      <div className="max-w-4xl mx-auto">
        <AnimateOnScroll>
          <h2
            className="text-center text-sm font-semibold tracking-widest uppercase mb-12"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            How It Works
          </h2>
        </AnimateOnScroll>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
          {steps.map((step, i) => (
            <AnimateOnScroll key={i} delay={i * 0.1}>
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                    }}
                  >
                    {step.icon}
                  </div>
                  <span
                    className="text-3xl font-light"
                    style={{
                      fontFamily:
                        "var(--font-instrument-serif), Georgia, serif",
                      color: "var(--cc-border-strong)",
                    }}
                  >
                    {step.num}
                  </span>
                </div>
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "var(--cc-text)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {step.desc}
                </p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
