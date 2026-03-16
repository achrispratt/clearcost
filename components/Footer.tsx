import Link from "next/link";

export function Footer() {
  return (
    <footer
      className="border-t px-4 sm:px-8 py-12 sm:py-16"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-bg)",
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Three-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: "var(--cc-primary)" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v20M2 12h20" />
                </svg>
              </div>
              <span
                className="text-lg"
                style={{
                  fontFamily: "var(--font-instrument-serif), Georgia, serif",
                  color: "var(--cc-text)",
                }}
              >
                ClearCost
              </span>
            </Link>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              Real hospital prices, searchable in plain English.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              Navigate
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/#how-it-works"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  How It Works
                </Link>
              </li>
              <li>
                <Link
                  href="/#what-you-can-search"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  What You Can Search
                </Link>
              </li>
              <li>
                <Link
                  href="/saved"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Saved Searches
                </Link>
              </li>
            </ul>
          </div>

          {/* Data & Legal */}
          <div>
            <h3
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              About the Data
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              Pricing data comes directly from hospital-published Machine
              Readable Files (MRFs), required by CMS under the Hospital Price
              Transparency Rule.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="border-t mt-8 pt-8 text-xs leading-relaxed"
          style={{
            borderColor: "var(--cc-border)",
            color: "var(--cc-text-tertiary)",
          }}
        >
          <p>
            Prices shown are self-pay / cash rates and may not reflect your
            final cost. ClearCost is a price transparency tool, not a medical
            device. It does not provide medical advice, diagnosis, or treatment
            recommendations. Always consult a qualified healthcare provider for
            medical decisions.
          </p>
          <p className="mt-3">&copy; {new Date().getFullYear()} ClearCost</p>
        </div>
      </div>
    </footer>
  );
}
