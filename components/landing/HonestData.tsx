import Link from "next/link";

const POINTS = [
  {
    lead: "Cash price first.",
    body: "When a hospital doesn’t publish one, we show what insurers pay there on average and say so.",
  },
  {
    lead: "We say what’s left out.",
    body: "Most hospital prices cover only the hospital’s part. Doctor and radiologist fees are often a separate bill, and we label them.",
  },
  {
    lead: "We say when we can’t.",
    body: "Some care, like heart surgery, is billed as a hospital stay we can’t price yet. You’ll get the questions to ask instead of a misleading number.",
  },
];

export function HonestData() {
  return (
    <section
      className="border-t px-4 lg:px-6 py-16 sm:py-20"
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
            Where the prices come from
          </h2>
          <p
            className="mt-3 text-[16px] leading-relaxed max-w-sm"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Since 2021, federal law has required U.S. hospitals to publish their
            prices. The files are huge and written for computers. We read them
            so you don&rsquo;t have to.
          </p>
        </div>
        <div>
          <ul className="space-y-5">
            {POINTS.map((p) => (
              <li
                key={p.lead}
                className="text-[16px] leading-relaxed"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                <strong
                  className="font-semibold"
                  style={{ color: "var(--cc-text)" }}
                >
                  {p.lead}
                </strong>{" "}
                {p.body}
              </li>
            ))}
          </ul>
          <p
            className="mt-6 text-[14px]"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            Hospitals update their files on different schedules and some
            don&rsquo;t publish everything, so always call to confirm.{" "}
            <Link
              href="/legal/disclaimers"
              className="underline"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              Read the full disclaimers
            </Link>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
