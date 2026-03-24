import { AnimateOnScroll } from "./AnimateOnScroll";

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function StepNumber({ n }: { n: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className="text-3xl font-light leading-none"
        style={{
          fontFamily: "var(--font-instrument-serif), Georgia, serif",
          color: "var(--cc-border-strong)",
        }}
      >
        {n}
      </span>
      <span className="h-px w-10" style={{ background: "var(--cc-border)" }} />
    </div>
  );
}

function Pill({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "accent" | "info";
}) {
  const styles: Record<string, { background: string; color: string }> = {
    primary: {
      background: "var(--cc-primary-light)",
      color: "var(--cc-primary)",
    },
    accent: { background: "var(--cc-accent-light)", color: "var(--cc-accent)" },
    info: { background: "var(--cc-primary-light)", color: "var(--cc-info)" },
  };
  return (
    <span
      className="text-[10px] font-medium rounded-full px-2.5 py-1"
      style={styles[variant]}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Search flow panels                                        */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-3.5 h-3.5"
      style={{ color: "var(--cc-text-tertiary)" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-3 h-3"
      style={{ color: "var(--cc-text-tertiary)" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  if (selected) {
    return (
      <span
        className="inline-block w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
        style={{
          borderColor: "var(--cc-primary)",
          background: "var(--cc-primary-light)",
        }}
      >
        <span
          className="block w-1.5 h-1.5 rounded-full mx-auto mt-[3px]"
          style={{ background: "var(--cc-primary)" }}
        />
      </span>
    );
  }
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full border-2 flex-shrink-0"
      style={{ borderColor: "var(--cc-border-strong)" }}
    />
  );
}

function FlowArrow() {
  return (
    <>
      <span
        className="hidden sm:flex items-center text-lg leading-none"
        style={{ color: "var(--cc-border-strong)" }}
        aria-hidden="true"
      >
        &rarr;
      </span>
      <span
        className="flex sm:hidden justify-center text-lg leading-none"
        style={{ color: "var(--cc-border-strong)" }}
        aria-hidden="true"
      >
        &darr;
      </span>
    </>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
      style={{ color: "var(--cc-text-tertiary)" }}
    >
      {children}
    </p>
  );
}

function FlowPanels() {
  return (
    <div className="flex flex-col sm:flex-row items-stretch gap-2 pointer-events-none select-none">
      {/* Panel 1 — You search */}
      <div
        role="img"
        aria-label="Search bar showing a query for knee MRI near Trenton NJ"
        className="flex-1 p-3 rounded-[10px]"
        style={{
          background: "var(--cc-surface)",
          border: "1px solid var(--cc-border)",
        }}
      >
        <PanelLabel>You search</PanelLabel>
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
          style={{
            border: "1px solid var(--cc-border)",
            background: "var(--cc-bg)",
          }}
        >
          <SearchIcon />
          <span style={{ color: "var(--cc-text)" }}>knee MRI</span>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs mt-1.5"
          style={{
            border: "1px solid var(--cc-border)",
            background: "var(--cc-bg)",
          }}
        >
          <PinIcon />
          <span style={{ color: "var(--cc-text-secondary)" }}>Trenton, NJ</span>
        </div>
      </div>

      <FlowArrow />

      {/* Panel 2 — We clarify */}
      <div
        role="img"
        aria-label="Clarification question asking if contrast is needed with radio button options"
        className="flex-1 p-3 rounded-[10px]"
        style={{
          background: "var(--cc-surface)",
          border: "1px solid var(--cc-border)",
        }}
      >
        <PanelLabel>We clarify</PanelLabel>
        <p
          className="text-sm mb-2"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Do you need contrast?
        </p>
        <div
          className="flex flex-col gap-1.5 text-xs"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          <span className="flex items-center gap-1.5">
            <RadioDot selected={true} /> Without
          </span>
          <span className="flex items-center gap-1.5">
            <RadioDot selected={false} /> With contrast
          </span>
          <span className="flex items-center gap-1.5">
            <RadioDot selected={false} /> Not sure
          </span>
        </div>
      </div>

      <FlowArrow />

      {/* Panel 3 — You choose */}
      <div
        role="img"
        aria-label="Final selection showing left knee chosen and resolved billing code 73721"
        className="flex-1 p-3 rounded-[10px]"
        style={{
          background: "var(--cc-surface)",
          border: "1px solid var(--cc-border)",
        }}
      >
        <PanelLabel>You choose</PanelLabel>
        <p
          className="text-sm mb-2"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Which knee?
        </p>
        <div
          className="flex flex-col gap-1.5 text-xs mb-2.5"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          <span className="flex items-center gap-1.5">
            <RadioDot selected={true} /> Left knee
          </span>
          <span className="flex items-center gap-1.5">
            <RadioDot selected={false} /> Right knee
          </span>
        </div>
        <span
          className="inline-block text-[10px] font-mono font-medium rounded px-2 py-0.5"
          style={{
            background: "var(--cc-primary-light)",
            color: "var(--cc-primary)",
          }}
        >
          73721 MRI knee w/o
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Mini result cards                                         */
/* ------------------------------------------------------------------ */

function ChevronUp() {
  return (
    <svg
      aria-hidden="true"
      className="w-3.5 h-3.5"
      style={{ color: "var(--cc-text-tertiary)" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg
      aria-hidden="true"
      className="w-3.5 h-3.5"
      style={{ color: "var(--cc-text-tertiary)" }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function MiniResultCards() {
  return (
    <div className="flex flex-col gap-2 pointer-events-none select-none">
      {/* Card 1 — Expanded */}
      <div
        className="rounded-lg p-2.5"
        style={{
          border: "1px solid var(--cc-border)",
          background: "var(--cc-surface)",
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold rounded px-1.5 py-0.5"
              style={{ background: "var(--cc-primary)", color: "white" }}
            >
              1
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--cc-text)" }}
            >
              Regional Medical Ctr
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: "var(--cc-success)" }}
            >
              $420
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              3.2 mi
            </span>
            <ChevronUp />
          </div>
        </div>

        {/* Expanded content */}
        <div
          className="rounded-md p-2"
          style={{
            background: "var(--cc-bg)",
            border: "1px solid var(--cc-border)",
          }}
        >
          <p
            className="text-[10px] mb-1"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            123 Medical Dr, Trenton, NJ
          </p>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              className="text-[9px] font-mono rounded px-1.5 py-0.5"
              style={{
                background: "var(--cc-primary-light)",
                color: "var(--cc-primary)",
              }}
            >
              CPT 73721
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              MRI knee w/o contrast
            </span>
          </div>
          <p
            className="text-xl font-bold"
            style={{ color: "var(--cc-success)" }}
          >
            $420
          </p>
          <p
            className="text-[10px] mb-2"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            Cash price
          </p>

          <div
            className="flex items-center gap-3 pt-1.5"
            style={{ borderTop: "1px solid var(--cc-border)" }}
          >
            <div className="flex items-center gap-1">
              <span
                className="text-[10px]"
                style={{ color: "var(--cc-success)" }}
              >
                Medicare $196
              </span>
              <span
                className="text-[9px] font-medium rounded px-1 py-0.5"
                style={{
                  background: "var(--cc-primary-light)",
                  color: "var(--cc-primary)",
                }}
              >
                2.1&times;
              </span>
            </div>
            <span className="text-[10px]" style={{ color: "var(--cc-info)" }}>
              Avg insured $312
            </span>
          </div>
        </div>
      </div>

      {/* Card 2 — Collapsed */}
      <div
        className="rounded-lg p-2.5"
        style={{
          border: "1px solid var(--cc-border)",
          background: "var(--cc-surface)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold rounded px-1.5 py-0.5"
              style={{
                background: "var(--cc-surface-alt)",
                color: "var(--cc-text-secondary)",
              }}
            >
              2
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--cc-text)" }}
            >
              St. Mary&apos;s
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: "var(--cc-text)" }}
            >
              $680
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              5.1 mi
            </span>
            <ChevronDown />
          </div>
        </div>
      </div>

      {/* Card 3 — Collapsed */}
      <div
        className="rounded-lg p-2.5"
        style={{
          border: "1px solid var(--cc-border)",
          background: "var(--cc-surface)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold rounded px-1.5 py-0.5"
              style={{
                background: "var(--cc-surface-alt)",
                color: "var(--cc-text-secondary)",
              }}
            >
              3
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--cc-text)" }}
            >
              Princeton Healthcare
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-bold"
              style={{ color: "var(--cc-text)" }}
            >
              $510
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              7.8 mi
            </span>
            <ChevronDown />
          </div>
        </div>
      </div>

      {/* Pills */}
      <div className="flex gap-1.5 mt-1">
        <Pill>Cash prices</Pill>
        <Pill variant="info">Medicare comparison</Pill>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Split view (list + map)                                   */
/* ------------------------------------------------------------------ */

function SplitView() {
  const rows = [
    {
      rank: 1,
      name: "Regional Medical Ctr",
      price: "$420",
      highlighted: true,
      priceColor: "var(--cc-success)",
    },
    {
      rank: 2,
      name: "St. Mary's Hospital",
      price: "$510",
      highlighted: false,
      priceColor: "var(--cc-text)",
    },
    {
      rank: 3,
      name: "Princeton Healthcare",
      price: "$680",
      highlighted: false,
      priceColor: "var(--cc-text)",
    },
    {
      rank: 4,
      name: "University Health",
      price: "$890",
      highlighted: false,
      priceColor: "var(--cc-accent)",
    },
    {
      rank: 5,
      name: "Capital Medical Grp",
      price: "$720",
      highlighted: false,
      priceColor: "var(--cc-text)",
    },
  ];

  const pins = [
    { top: "30%", left: "25%", label: "$420", color: "var(--cc-success)" },
    { top: "55%", left: "60%", label: "$510", color: "var(--cc-success)" },
    { top: "20%", left: "70%", label: "$680", color: "var(--cc-success)" },
    { top: "70%", left: "35%", label: "$890", color: "var(--cc-accent)" },
    { top: "45%", left: "80%", label: "$720", color: "var(--cc-success)" },
  ];

  return (
    <div>
      <div
        role="img"
        aria-label="Split view showing search results list alongside a map with price markers"
        className="overflow-hidden h-auto sm:h-[200px] sm:flex pointer-events-none select-none rounded-[10px]"
        style={{ border: "1px solid var(--cc-border)" }}
      >
        {/* Left — Result list (55%) */}
        <div
          className="w-full sm:w-[55%] p-2"
          style={{ background: "var(--cc-surface)" }}
        >
          {/* Filter pills */}
          <div className="flex gap-1 mb-1.5">
            <span
              className="text-[8px] rounded-full px-2 py-0.5"
              style={{
                background: "var(--cc-surface-alt)",
                color: "var(--cc-text-secondary)",
                border: "1px solid var(--cc-border)",
              }}
            >
              25 mi
            </span>
            <span
              className="text-[8px] rounded-full px-2 py-0.5"
              style={{
                background: "var(--cc-surface-alt)",
                color: "var(--cc-text-secondary)",
                border: "1px solid var(--cc-border)",
              }}
            >
              Price &uarr;
            </span>
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-0.5">
            {rows.map((row) => (
              <div
                key={row.rank}
                className="flex items-center justify-between rounded px-1.5 py-1"
                style={{
                  background: row.highlighted
                    ? "var(--cc-primary-light)"
                    : "transparent",
                  border: row.highlighted
                    ? "1px solid var(--cc-primary)"
                    : "1px solid transparent",
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="text-[9px] font-bold flex-shrink-0"
                    style={{ color: "var(--cc-text-tertiary)" }}
                  >
                    {row.rank}
                  </span>
                  <span
                    className="text-[10px] truncate"
                    style={{ color: "var(--cc-text)" }}
                  >
                    {row.name}
                  </span>
                </div>
                <span
                  className="text-[10px] font-bold flex-shrink-0 ml-2"
                  style={{ color: row.priceColor }}
                >
                  {row.price}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Map (45%) */}
        <div
          className="w-full sm:w-[45%] h-[200px] sm:h-auto relative"
          style={{
            background: "#f5f3ef",
            borderLeft: "1px solid var(--cc-border)",
          }}
        >
          {/* SVG road grid */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Horizontal roads */}
            <line
              x1="0"
              y1="30%"
              x2="100%"
              y2="30%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
            <line
              x1="0"
              y1="55%"
              x2="100%"
              y2="55%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
            <line
              x1="0"
              y1="80%"
              x2="100%"
              y2="80%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
            {/* Vertical roads */}
            <line
              x1="25%"
              y1="0"
              x2="25%"
              y2="100%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
            <line
              x1="50%"
              y1="0"
              x2="50%"
              y2="100%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
            <line
              x1="75%"
              y1="0"
              x2="75%"
              y2="100%"
              stroke="var(--cc-border)"
              strokeWidth="1"
              opacity="0.4"
            />
          </svg>

          {/* Price pins */}
          {pins.map((pin, i) => (
            <span
              key={i}
              className="absolute text-[8px] font-bold rounded-full px-1.5 py-0.5 -translate-x-1/2 -translate-y-1/2"
              style={{
                top: pin.top,
                left: pin.left,
                background: pin.color,
                color: "#fff",
              }}
            >
              {pin.label}
            </span>
          ))}

          {/* User location dot */}
          <span
            className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{
              top: "50%",
              left: "45%",
              background: "#3b82f6",
              border: "2px solid #fff",
              boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.3)",
            }}
          />
        </div>
      </div>

      {/* Pills below */}
      <div className="flex gap-1.5 mt-2">
        <Pill>Map + List</Pill>
        <Pill>Filter by distance</Pill>
        <Pill variant="accent">5,400+ hospitals</Pill>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-label="How It Works"
      className="border-t px-4 py-16 sm:py-20"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <AnimateOnScroll>
          <p
            className="text-center text-sm font-semibold tracking-widest uppercase mb-12"
            style={{ color: "var(--cc-text-tertiary)" }}
            aria-hidden="true"
          >
            How It Works
          </p>
        </AnimateOnScroll>

        {/* ---- Step 1 ---- */}
        <div
          className="flex flex-col sm:flex-row gap-8 sm:gap-10 pb-10 mb-10"
          style={{ borderBottom: "1px solid var(--cc-border)" }}
        >
          {/* Left text */}
          <AnimateOnScroll>
            <div className="sm:w-[280px] flex-shrink-0">
              <StepNumber n="01" />
              <h3
                className="text-xl font-semibold mb-2"
                style={{ color: "var(--cc-text)" }}
              >
                Search in plain English
              </h3>
              <p
                className="text-sm leading-relaxed mb-3"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Describe what you need. Our AI translates your words into
                billing codes, asking smart follow-up questions to get the exact
                procedure.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Pill>AI-powered</Pill>
                <Pill>1,000+ procedures</Pill>
              </div>
            </div>
          </AnimateOnScroll>

          {/* Right flow panels */}
          <AnimateOnScroll delay={0.1}>
            <div className="flex-1 min-w-0">
              <FlowPanels />
            </div>
          </AnimateOnScroll>
        </div>

        {/* ---- Steps 2 + 3 ---- */}
        <div className="flex flex-col sm:flex-row gap-8 sm:gap-0">
          {/* Step 2 */}
          <AnimateOnScroll>
            <div className="flex-1 sm:pr-8">
              <StepNumber n="02" />
              <h3
                className="text-xl font-semibold mb-3"
                style={{ color: "var(--cc-text)" }}
              >
                Compare real prices
              </h3>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                See actual cash prices from hospital pricing data, mandated by
                federal law since 2021.
              </p>
              <MiniResultCards />
            </div>
          </AnimateOnScroll>

          {/* Vertical divider */}
          <div
            className="hidden sm:block w-px self-stretch"
            style={{ background: "var(--cc-border)" }}
          />

          {/* Step 3 */}
          <AnimateOnScroll delay={0.1}>
            <div className="flex-1 sm:pl-8">
              <StepNumber n="03" />
              <h3
                className="text-xl font-semibold mb-3"
                style={{ color: "var(--cc-text)" }}
              >
                Find nearby providers
              </h3>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Map and list views help you find the best price at a convenient
                location near you.
              </p>
              <SplitView />
            </div>
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  );
}
