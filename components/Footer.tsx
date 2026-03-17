import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t px-4 sm:px-8 py-12 sm:py-16" style={{ borderColor: "var(--cc-border)", background: "var(--cc-bg)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand column */}
          {/* Navigate column */}
          {/* About the Data column */}
          {/* Legal column */}
          <div>
            <h3 className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: "var(--cc-text-tertiary)" }}>
              Legal
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/legal/terms" className="text-sm hover:underline" style={{ color: "var(--cc-text-secondary)" }}>
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-sm hover:underline" style={{ color: "var(--cc-text-secondary)" }}>
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/disclaimers" className="text-sm hover:underline" style={{ color: "var(--cc-text-secondary)" }}>
                  Disclaimers
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-xs leading-relaxed" style={{ borderColor: "var(--cc-border)", color: "var(--cc-text-tertiary)" }}>
          <p>
            Prices shown are self-pay / cash rates and may not reflect your
            final cost. ClearCost is a price transparency tool, not a medical
            device. It does not provide medical advice, diagnosis, or treatment
            recommendations. Always consult a qualified healthcare provider for
            medical decisions.{" "}
            <Link href="/legal/disclaimers" className="underline hover:no-underline" style={{ color: "var(--cc-primary)" }}>
              Full disclaimers
            </Link>
          </p>
          <p className="mt-3">&copy; {new Date().getFullYear()} ClearCost</p>
        </div>
      </div>
    </footer>
  );
}
