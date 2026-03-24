import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — ClearCost",
};

const TOC_ITEMS = [
  { href: "#information-we-collect", label: "1. Information We Collect" },
  { href: "#how-we-use", label: "2. How We Use Your Information" },
  { href: "#not-collected", label: "3. Information We Do NOT Collect" },
  { href: "#third-party", label: "4. Third-Party Services" },
  { href: "#retention", label: "5. Data Retention" },
  { href: "#your-rights", label: "6. Your Rights" },
  { href: "#childrens-privacy", label: "7. Children's Privacy" },
  { href: "#changes", label: "8. Changes to This Policy" },
];

export default function PrivacyPage() {
  return (
    <article>
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-4xl mb-2"
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Privacy Policy
        </h1>
        <p className="text-sm" style={{ color: "var(--cc-text-secondary)" }}>
          Last updated: March 2026
        </p>
      </div>

      {/* Table of Contents */}
      <nav
        className="rounded-xl p-5 mb-10 border"
        style={{
          background: "var(--cc-surface-alt)",
          borderColor: "var(--cc-border)",
        }}
        aria-label="Table of contents"
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          Contents
        </p>
        <ul className="space-y-1.5">
          {TOC_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-sm transition-colors hover:underline"
                style={{ color: "var(--cc-primary)" }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sections */}
      <div className="space-y-10" style={{ color: "var(--cc-text)" }}>
        {/* 1. Information We Collect */}
        <section id="information-we-collect">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            1. Information We Collect
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost collects limited information necessary to provide the
              Service. We do not collect information beyond what is needed to
              operate the price transparency tool.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Search queries.
                </strong>{" "}
                The plain-text descriptions you enter when searching for
                healthcare procedures (e.g., &ldquo;knee MRI&rdquo; or
                &ldquo;blood test for cholesterol&rdquo;). These are used to
                translate your query into billing codes and return price
                results.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Location data.
                </strong>{" "}
                Latitude and longitude coordinates used to return geographically
                relevant hospital pricing results. Location data is used only
                for search and is not stored unless you save a search.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Google account information.
                </strong>{" "}
                If you choose to sign in, ClearCost receives your email address,
                display name, and profile picture from Google via OAuth. This
                information is collected only if you create an account; account
                creation is not required to use the Service.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>Usage data.</strong>{" "}
                Standard analytics data including pages visited, features used,
                browser type, and general geographic region. This data is used
                in aggregate to understand how the Service is used and to
                improve it.
              </li>
            </ul>
          </div>
        </section>

        {/* 2. How We Use Your Information */}
        <section id="how-we-use">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            2. How We Use Your Information
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Price search.
                </strong>{" "}
                Your search query is sent to our AI interpretation service to
                translate it into standardized billing codes (CPT, HCPCS,
                MS-DRG), which are then used to query hospital pricing data near
                your location.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Saved searches.
                </strong>{" "}
                If you are signed in, you may choose to save search results for
                future reference. Saved searches are stored in association with
                your account and are accessible only to you.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Service improvement.
                </strong>{" "}
                Aggregated, anonymized usage data helps us understand which
                features are used, identify technical issues, and improve the
                Service over time.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  We do not sell your personal data.
                </strong>{" "}
                ClearCost does not sell, rent, or trade your personal
                information to third parties for their marketing or commercial
                purposes.
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Information We Do NOT Collect — KEY SECTION with teal callout */}
        <section id="not-collected">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            3. Information We Do NOT Collect
          </h2>

          {/* Teal callout box */}
          <div
            className="rounded-xl p-5 mb-4 border"
            style={{
              background: "var(--cc-primary-light)",
              borderColor: "var(--cc-primary-muted)",
            }}
          >
            <p
              className="text-sm font-semibold mb-2"
              style={{ color: "var(--cc-primary)" }}
            >
              ClearCost does not collect Protected Health Information (PHI)
            </p>
            <p
              className="text-sm leading-relaxed mb-3"
              style={{ color: "var(--cc-primary)" }}
            >
              ClearCost is not a healthcare provider, health plan, or healthcare
              clearinghouse, and is not subject to HIPAA as a covered entity or
              business associate. We do not collect, store, or process Protected
              Health Information as defined under the Health Insurance
              Portability and Accountability Act (HIPAA).
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--cc-primary)" }}
            >
              <strong>
                Your search queries are price research — not medical records.
              </strong>{" "}
              Entering &ldquo;knee MRI&rdquo; or &ldquo;colonoscopy&rdquo; into
              ClearCost is analogous to searching for the cost of a service
              online. It does not create a medical record, a patient-provider
              relationship, or any health information covered by HIPAA.
            </p>
          </div>

          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>We specifically do not collect or store:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Medical records or clinical documentation of any kind</li>
              <li>
                Insurance plan details, member IDs, or coverage information
              </li>
              <li>
                Social Security numbers or government-issued identification
              </li>
              <li>Patient identifiers as defined under HIPAA</li>
              <li>Diagnostic codes tied to a specific individual</li>
              <li>Treatment history, prescriptions, or clinical notes</li>
              <li>
                Financial account numbers, payment card numbers, or banking
                information
              </li>
            </ul>
          </div>
        </section>

        {/* 4. Third-Party Services */}
        <section id="third-party">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            4. Third-Party Services
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost uses the following third-party services to operate. Each
              has its own privacy policy governing how it handles data.
            </p>
            <div className="space-y-4 mt-4">
              <div
                className="rounded-lg p-4 border"
                style={{
                  background: "var(--cc-surface)",
                  borderColor: "var(--cc-border)",
                }}
              >
                <p
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--cc-text)" }}
                >
                  Supabase
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Database hosting and user authentication. Stores account data
                  (email, display name) and saved searches for signed-in users.
                  Data is stored in a Supabase-managed Postgres database with
                  row-level security policies.
                </p>
              </div>
              <div
                className="rounded-lg p-4 border"
                style={{
                  background: "var(--cc-surface)",
                  borderColor: "var(--cc-border)",
                }}
              >
                <p
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--cc-text)" }}
                >
                  Anthropic Claude API
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  AI-powered search query interpretation. Your search queries
                  are sent to Anthropic&apos;s API to translate plain-language
                  descriptions into standardized billing codes. Queries are
                  processed by Anthropic&apos;s systems in accordance with
                  Anthropic&apos;s usage policies. ClearCost does not use your
                  queries to train AI models.
                </p>
              </div>
              <div
                className="rounded-lg p-4 border"
                style={{
                  background: "var(--cc-surface)",
                  borderColor: "var(--cc-border)",
                }}
              >
                <p
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--cc-text)" }}
                >
                  Google Maps
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Location geocoding and interactive map display. Used to
                  convert location names to coordinates for geographic search
                  and to display hospital locations on a map. Subject to
                  Google&apos;s Privacy Policy.
                </p>
              </div>
              <div
                className="rounded-lg p-4 border"
                style={{
                  background: "var(--cc-surface)",
                  borderColor: "var(--cc-border)",
                }}
              >
                <p
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--cc-text)" }}
                >
                  Vercel
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Web application hosting and content delivery. Standard request
                  logs (IP address, browser type, pages visited) may be retained
                  by Vercel as part of normal hosting operations. Subject to
                  Vercel&apos;s Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Data Retention */}
        <section id="retention">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            5. Data Retention
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost retains data only as long as necessary to provide the
              Service or as required by law.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Search queries.
                </strong>{" "}
                Queries you enter are not stored unless you explicitly save a
                search. Unsaved queries are used in real time to return results
                and are not persisted to our database.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Saved searches.
                </strong>{" "}
                Retained until you delete them through the Service or submit a
                deletion request. You can delete individual saved searches at
                any time from your account.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Account data.
                </strong>{" "}
                Your email address, display name, and profile picture are
                retained for as long as your account remains active. Upon
                account deletion, your personal data and associated saved
                searches are removed from our database.
              </li>
            </ul>
          </div>
        </section>

        {/* 6. Your Rights */}
        <section id="your-rights">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            6. Your Rights
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              You have the following rights with respect to your data held by
              ClearCost:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong style={{ color: "var(--cc-text)" }}>Access.</strong> You
                may request a copy of the personal data ClearCost holds about
                you.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>Deletion.</strong>{" "}
                You may request deletion of your account and all associated
                data. Saved searches can be deleted directly through the Service
                at any time.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>Download.</strong>{" "}
                You may request a copy of your saved searches in a portable
                format.
              </li>
              <li>
                <strong style={{ color: "var(--cc-text)" }}>
                  Opt out of data collection.
                </strong>{" "}
                You may use ClearCost without creating an account.
                Unauthenticated use does not result in any persistent data being
                stored about you by ClearCost.
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:privacy@clearcost.com"
                className="hover:underline"
                style={{ color: "var(--cc-primary)" }}
              >
                privacy@clearcost.com
              </a>
              . We will respond to verifiable requests within 30 days.
            </p>
          </div>
        </section>

        {/* 7. Children's Privacy */}
        <section id="childrens-privacy">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            7. Children&apos;s Privacy
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost is not directed at children under the age of 13. We do
              not knowingly collect personal information from children under 13.
              In compliance with the Children&apos;s Online Privacy Protection
              Act (COPPA), if we become aware that a child under 13 has provided
              us with personal information, we will promptly delete that
              information from our systems.
            </p>
            <p>
              If you are a parent or guardian and believe your child under 13
              has provided personal information to ClearCost, please contact us
              at{" "}
              <a
                href="mailto:privacy@clearcost.com"
                className="hover:underline"
                style={{ color: "var(--cc-primary)" }}
              >
                privacy@clearcost.com
              </a>{" "}
              and we will take steps to remove that information.
            </p>
          </div>
        </section>

        {/* 8. Changes to This Policy */}
        <section id="changes">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            8. Changes to This Policy
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in the Service, applicable law, or our data practices.
              When we make material changes, we will update the &ldquo;Last
              updated&rdquo; date at the top of this page and, where
              appropriate, provide additional notice — such as an in-app
              notification or an email to registered users.
            </p>
            <p>
              The &ldquo;Last updated&rdquo; date at the top of this page
              reflects the date of the most recent revision. We encourage you to
              review this policy periodically. Your continued use of the Service
              after changes become effective constitutes your acceptance of the
              updated policy.
            </p>
            <p>
              The current version of this Privacy Policy is always available at{" "}
              <span style={{ color: "var(--cc-primary)" }}>
                clearcost.com/legal/privacy
              </span>
              .
            </p>
          </div>
        </section>

        {/* Footer */}
        <div
          className="pt-6 border-t text-sm"
          style={{
            borderColor: "var(--cc-border)",
            color: "var(--cc-text-tertiary)",
          }}
        >
          <p>
            Questions about this Privacy Policy? Contact us at{" "}
            <a
              href="mailto:privacy@clearcost.com"
              className="hover:underline"
              style={{ color: "var(--cc-primary)" }}
            >
              privacy@clearcost.com
            </a>
            .
          </p>
        </div>
      </div>
    </article>
  );
}
