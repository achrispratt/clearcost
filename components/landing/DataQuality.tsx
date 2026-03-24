import { AnimateOnScroll } from "./AnimateOnScroll";

export function DataQuality() {
  return (
    <section
      className="border-t px-4 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
      }}
    >
      <div className="max-w-3xl mx-auto">
        <AnimateOnScroll>
          <h2
            className="text-2xl sm:text-3xl leading-tight mb-8 text-center"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            Built on transparency &mdash; even about our limits
          </h2>
        </AnimateOnScroll>

        <AnimateOnScroll delay={0.1}>
          <div className="space-y-5 text-center">
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              Hospital price transparency is still maturing. Not all hospitals
              comply fully, and data formats vary widely across facilities. Some
              prices may be missing, and others may not yet reflect the latest
              updates.
            </p>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              We believe in showing you what&rsquo;s available today rather than
              waiting for perfection. As hospitals publish better data,
              ClearCost gets better automatically.
            </p>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll delay={0.2}>
          <div
            className="mt-8 rounded-lg px-5 py-4"
            style={{
              borderLeft: "3px solid var(--cc-accent)",
              background: "var(--cc-accent-light)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--cc-text)" }}>
              <strong>Why some prices may be missing:</strong> Hospitals publish
              pricing files at different intervals and in varying formats. We
              continuously process new data as it becomes available, so coverage
              improves over time.
            </p>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  );
}
