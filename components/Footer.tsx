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
        {/* Four-column grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="text-lg mb-3 inline-block"
              style={{
                fontFamily: "var(--font-instrument-serif), Georgia, serif",
                fontWeight: 500,
              }}
            >
              <span style={{ color: "var(--cc-text)" }}>Clear</span>
              <span style={{ color: "var(--cc-primary)" }}>Cost</span>
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

          {/* Legal */}
          <div>
            <h3
              className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/legal/terms"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/disclaimers"
                  className="text-sm hover:underline"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Disclaimers
                </Link>
              </li>
            </ul>
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
            medical decisions.{" "}
            <Link
              href="/legal/disclaimers"
              className="underline hover:no-underline"
              style={{ color: "var(--cc-primary)" }}
            >
              Full disclaimers
            </Link>
          </p>
          <p className="mt-3">&copy; {new Date().getFullYear()} ClearCost</p>
        </div>
      </div>
    </footer>
  );
}
