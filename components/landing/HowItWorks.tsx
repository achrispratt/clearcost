const STEPS = [
  {
    lead: "You ask in plain English.",
    body: "Say “my doctor wants a scan of my knee” or type what’s on your order. You don’t need a billing code.",
  },
  {
    lead: "We ask what changes the price.",
    body: "Usually two or three taps, like with or without contrast, or which knee. Each answer is explained in everyday words.",
  },
  {
    lead: "You get an itemized answer.",
    body: "A price range near you, the lowest place, what’s billed separately, and the code to give the front desk when you call.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 border-t px-4 lg:px-6 py-16 sm:py-20"
      style={{ borderColor: "var(--cc-border)" }}
    >
      <div className="max-w-[1120px] mx-auto grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2
            className="text-[34px] sm:text-[40px] leading-[1.1]"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            How it works
          </h2>
          <p
            className="mt-3 text-[16px] leading-relaxed max-w-sm"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Hospital prices are public, but they&rsquo;re filed under billing
            codes. ClearCost does the translating.
          </p>
        </div>
        <ul className="slip !px-5 sm:!px-6">
          {STEPS.map((step) => (
            <li
              key={step.lead}
              className="py-5 border-b border-dashed last:border-b-0"
              style={{ borderColor: "var(--cc-border-strong)" }}
            >
              <p
                className="text-[17px] font-semibold"
                style={{ color: "var(--cc-text)" }}
              >
                {step.lead}
              </p>
              <p
                className="mt-1 text-[15px] leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                {step.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
