import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — ClearCost",
};

const TOC_ITEMS = [
  { href: "#acceptance", label: "1. Acceptance of Terms" },
  { href: "#description", label: "2. Description of Service" },
  { href: "#not-medical-advice", label: "3. Not Medical Advice" },
  { href: "#data-sources", label: "4. Data Sources & Accuracy" },
  { href: "#accounts", label: "5. User Accounts & Saved Searches" },
  { href: "#ai-features", label: "6. AI-Powered Features" },
  { href: "#liability", label: "7. Limitation of Liability" },
  { href: "#ip", label: "8. Intellectual Property" },
  { href: "#modifications", label: "9. Modifications to Service" },
  { href: "#governing-law", label: "10. Governing Law" },
];

export default function TermsPage() {
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
          Terms of Service
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
        {/* 1. Acceptance of Terms */}
        <section id="acceptance">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            1. Acceptance of Terms
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              By accessing or using ClearCost (the &ldquo;Service&rdquo;),
              operated by ClearCost, Inc. (&ldquo;ClearCost,&rdquo;
              &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you
              agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;).
              These Terms constitute a legally binding agreement between you and
              ClearCost. Please read them carefully before using the Service.
            </p>
            <p>
              If you do not agree to these Terms in their entirety, you must not
              access or use the Service. Your continued use of the Service after
              any modification to these Terms constitutes your acceptance of the
              updated Terms.
            </p>
            <p>
              These Terms apply to all visitors, registered users, and anyone
              else who accesses or uses the Service. By using the Service, you
              represent that you are at least 18 years of age or are accessing
              the Service under the supervision of a parent or legal guardian
              who agrees to these Terms.
            </p>
          </div>
        </section>

        {/* 2. Description of Service */}
        <section id="description">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            2. Description of Service
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost is a healthcare price transparency tool that helps
              consumers research and compare hospital prices for medical
              procedures. The Service allows users to enter plain-language
              descriptions of healthcare services (e.g., &ldquo;knee
              MRI&rdquo;), which are translated into standardized medical
              billing codes (CPT, HCPCS, MS-DRG), and returns pricing
              information from hospitals nationwide.
            </p>
            <p>
              Pricing data is sourced from Machine Readable Files (MRFs)
              published by hospitals pursuant to the CMS Hospital Price
              Transparency Rule (45 C.F.R. § 180). The Service currently covers
              pricing information from more than 5,400 hospitals across the
              United States for over 1,000 procedure codes.
            </p>
            <p>
              The Service includes a guided search feature that uses artificial
              intelligence to ask clarifying questions to help identify the
              appropriate billing codes for a user&apos;s healthcare needs.
              These questions are administrative in nature — they are designed
              to identify relevant billing codes, not to provide clinical
              assessment or medical recommendations.
            </p>
            <p>
              ClearCost is provided for informational purposes only. The Service
              does not schedule appointments, facilitate transactions between
              users and healthcare providers, or guarantee any particular price
              from any provider.
            </p>
          </div>
        </section>

        {/* 3. Not Medical Advice — KEY SECTION */}
        <section id="not-medical-advice">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            3. Not Medical Advice
          </h2>

          {/* Teal callout box */}
          <div
            className="bg-[var(--cc-primary-light)] border-l-4 p-4 rounded-r-lg mb-4"
            style={{ borderColor: "var(--cc-primary)" }}
          >
            <p
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--cc-primary)" }}
            >
              Important Notice
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--cc-primary)" }}
            >
              ClearCost provides healthcare pricing information{" "}
              <strong>for informational purposes only</strong>. The Service is
              not a substitute for professional medical advice, diagnosis, or
              treatment.{" "}
              <strong>
                Always seek the advice of your physician or other qualified
                healthcare provider
              </strong>{" "}
              with any questions you may have regarding a medical condition or
              treatment, and before undertaking a new healthcare regimen.
            </p>
          </div>

          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost is not a medical device, clinical decision support
              system, healthcare provider, or licensed healthcare professional.
              No provider-patient relationship is created between you and
              ClearCost by virtue of your use of the Service.
            </p>
            <p>
              The guided search clarifying questions are designed solely to
              identify the administrative billing codes most likely to
              correspond to the healthcare service you are researching. They are
              not a clinical assessment, medical evaluation, or triage tool, and
              should not be interpreted as medical recommendations. The
              questions help narrow billing code identification — they do not
              constitute diagnosis, prognosis, or treatment planning.
            </p>
            <p>
              Never disregard professional medical advice or delay seeking it
              because of information you obtained through the Service. If you
              think you may have a medical emergency, call your doctor, a crisis
              line, or emergency services immediately.
            </p>
            <p>
              ClearCost has not been evaluated or cleared by the U.S. Food and
              Drug Administration (FDA) and is expressly exempt from FDA
              regulation as a clinical decision support (CDS) software tool
              under Section 3060 of the 21st Century Cures Act.
            </p>
          </div>
        </section>

        {/* 4. Data Sources & Accuracy */}
        <section id="data-sources">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            4. Data Sources &amp; Accuracy
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              Pricing data displayed by the Service is obtained from Machine
              Readable Files (MRFs) that hospitals are required to publish under
              the CMS Hospital Price Transparency Rule. ClearCost aggregates,
              processes, and presents this publicly available data to make it
              more accessible to consumers.
            </p>
            <p>
              <strong style={{ color: "var(--cc-text)" }}>
                Prices are estimates and may vary.
              </strong>{" "}
              Prices shown represent self-pay (cash pay) rates or gross charges
              as reported by individual hospitals. Actual prices you are charged
              may differ based on your insurance coverage, negotiated rates,
              facility fees, the specific services rendered, and other factors
              determined at the time of service.
            </p>
            <p>
              Prices displayed may not include all fees associated with a
              procedure. Hospital facility charges typically represent
              approximately 70–80% of the total cost of a procedure. Additional
              fees — such as professional fees from physicians, radiologists,
              anesthesiologists, or other providers — are often billed
              separately and are not reflected in the prices shown.
            </p>
            <p>
              Hospital pricing data may change after publication. ClearCost
              makes reasonable efforts to keep data current but does not
              guarantee that all pricing information is complete, accurate, or
              up to date at any given time. Always confirm pricing directly with
              your healthcare provider before scheduling a service or making any
              financial decisions.
            </p>
            <p>
              ClearCost is not responsible for errors or omissions in pricing
              data submitted by hospitals or processed from MRFs. The Service
              presents data as reported and does not independently verify the
              accuracy of hospital-reported prices.
            </p>
          </div>
        </section>

        {/* 5. User Accounts & Saved Searches */}
        <section id="accounts">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            5. User Accounts &amp; Saved Searches
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost offers optional user accounts authenticated via Google
              OAuth through Supabase. Creating an account is not required to
              search for pricing information. Account creation is required only
              to save searches for later reference.
            </p>
            <p>
              When you create an account, ClearCost collects the information
              provided by Google as part of the OAuth authentication process,
              which may include your email address, display name, and profile
              picture. ClearCost does not collect or store sensitive personal
              health information (PHI) as defined under HIPAA and is not a HIPAA
              covered entity or business associate.
            </p>
            <p>
              Saved searches are stored and protected using row-level security
              (RLS) policies that ensure your saved data is accessible only to
              your authenticated account. You may delete your saved searches at
              any time through the Service. To request deletion of your account
              and all associated data, contact us at the address provided in
              these Terms.
            </p>
            <p>
              You are responsible for maintaining the confidentiality of your
              Google account credentials. ClearCost is not liable for any loss
              or damage arising from unauthorized access to your account
              resulting from your failure to maintain adequate credential
              security. You agree to notify us immediately of any unauthorized
              use of your account.
            </p>
          </div>
        </section>

        {/* 6. AI-Powered Features */}
        <section id="ai-features">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            6. AI-Powered Features
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost uses artificial intelligence — specifically, the Claude
              API provided by Anthropic, PBC — to interpret plain-language
              search queries and translate them into standardized medical
              billing codes. This AI-powered interpretation is a core feature of
              the Service.
            </p>
            <p>
              <strong style={{ color: "var(--cc-text)" }}>
                AI interpretation is approximate.
              </strong>{" "}
              The billing codes identified by the AI may not precisely match the
              codes your healthcare provider ultimately uses for billing
              purposes. Different providers may use different codes for the same
              procedure, and coding practices can vary by setting, payer, and
              clinical circumstance. Always verify billing codes and associated
              prices directly with your provider.
            </p>
            <p>
              The guided search uses a multi-turn AI conversation to narrow
              vague queries to specific billing codes. Questions asked during
              this process are administrative — designed to identify the most
              likely applicable billing codes, not to provide a clinical
              assessment. The AI does not have access to your medical records,
              history, or any personally identifiable health information.
            </p>
            <p>
              ClearCost does not use your search queries or conversation history
              to train AI models. Query data may be processed by
              Anthropic&apos;s systems as part of the API service in accordance
              with Anthropic&apos;s usage policies. We do not sell your query
              data to third parties.
            </p>
          </div>
        </section>

        {/* 7. Limitation of Liability */}
        <section id="liability">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            7. Limitation of Liability
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLEARCOST AND
              ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, AND SERVICE
              PROVIDERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT
              LIMITED TO LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR
              IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.
            </p>
            <p>Without limiting the foregoing, ClearCost is not liable for:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Any medical decisions, treatment choices, or healthcare actions
                taken in reliance on pricing information displayed by the
                Service;
              </li>
              <li>
                Any financial decisions made in reliance on prices shown,
                including unexpected charges or billing discrepancies;
              </li>
              <li>
                Any inaccuracy, incompleteness, or outdated nature of pricing
                data sourced from hospital MRFs;
              </li>
              <li>
                Any misidentification of billing codes by the AI interpretation
                system;
              </li>
              <li>
                Any delay or failure in the Service caused by circumstances
                beyond our reasonable control.
              </li>
            </ul>
            <p>
              IN NO EVENT SHALL CLEARCOST&apos;S TOTAL LIABILITY TO YOU FOR ALL
              CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE EXCEED THE GREATER
              OF (A) THE AMOUNT YOU PAID TO CLEARCOST IN THE TWELVE (12) MONTHS
              PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100). SOME
              JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN
              DAMAGES, SO THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU.
            </p>
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
              AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT.
            </p>
          </div>
        </section>

        {/* 8. Intellectual Property */}
        <section id="ip">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            8. Intellectual Property
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              The ClearCost name, logo, website design, software, user
              interface, and all content created by ClearCost — including the
              AI-generated billing code interpretations, search algorithms, and
              guided search prompting system — are owned by ClearCost, Inc. and
              are protected by copyright, trademark, trade secret, and other
              applicable intellectual property laws.
            </p>
            <p>
              Hospital pricing data displayed by the Service is sourced from
              Machine Readable Files published by hospitals as required by
              federal regulation. This data originates from public sources and
              is not proprietary to ClearCost. ClearCost&apos;s rights in the
              Service relate to the compilation, processing, presentation, and
              transformation of this data, not to the underlying pricing figures
              themselves.
            </p>
            <p>
              You retain ownership of any search queries you submit and the
              saved searches stored in your account. By using the Service, you
              grant ClearCost a limited, non-exclusive license to process your
              queries for the purpose of providing the Service. We do not claim
              ownership over the content of your searches.
            </p>
            <p>
              You may not reproduce, distribute, modify, create derivative works
              from, publicly display, or commercially exploit any portion of the
              Service or its proprietary content without prior written
              permission from ClearCost.
            </p>
          </div>
        </section>

        {/* 9. Modifications to Service */}
        <section id="modifications">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            9. Modifications to Service and Terms
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              ClearCost reserves the right to modify, suspend, or discontinue
              the Service — or any feature thereof — at any time, with or
              without notice. We shall not be liable to you or to any third
              party for any modification, suspension, or discontinuation of the
              Service.
            </p>
            <p>
              We may update these Terms from time to time to reflect changes in
              the Service, applicable law, or our practices. When we make
              material changes, we will update the &ldquo;Last updated&rdquo;
              date at the top of this page and, where appropriate, provide
              additional notice (such as an in-app notification or email to
              registered users).
            </p>
            <p>
              Your continued use of the Service after any changes to these Terms
              become effective constitutes your acceptance of the revised Terms.
              If you do not agree to the updated Terms, you must stop using the
              Service.
            </p>
            <p>
              We encourage you to review these Terms periodically to stay
              informed about your rights and obligations. The most current
              version of these Terms is always available at{" "}
              <span style={{ color: "var(--cc-primary)" }}>
                clearcost.com/legal/terms
              </span>
              .
            </p>
          </div>
        </section>

        {/* 10. Governing Law */}
        <section id="governing-law">
          <h2
            className="text-xl font-semibold mb-3"
            style={{ color: "var(--cc-primary)" }}
          >
            10. Governing Law &amp; Dispute Resolution
          </h2>
          <div
            className="space-y-3 text-sm leading-relaxed"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <p>
              These Terms and any dispute arising out of or related to the
              Service or these Terms shall be governed by and construed in
              accordance with the laws of the State of Delaware, without regard
              to its conflict of laws principles.
            </p>
            <p>
              <strong style={{ color: "var(--cc-text)" }}>
                Binding Arbitration.
              </strong>{" "}
              Except for claims that qualify for small claims court, any
              dispute, claim, or controversy arising out of or relating to the
              Service or these Terms — including the determination of the scope
              or applicability of this agreement to arbitrate — shall be
              resolved by binding arbitration administered by the American
              Arbitration Association (AAA) under its Consumer Arbitration
              Rules. Arbitration shall be conducted on an individual basis;
              class arbitrations and class actions are not permitted.
            </p>
            <p>
              <strong style={{ color: "var(--cc-text)" }}>
                Opt-Out Right.
              </strong>{" "}
              You may opt out of the arbitration agreement within 30 days of
              first accepting these Terms by sending written notice to ClearCost
              at the contact address below. Opting out does not affect any other
              provision of these Terms.
            </p>
            <p>
              If the arbitration agreement is found to be unenforceable for any
              reason, the parties agree to submit to the exclusive jurisdiction
              of the state and federal courts located in the State of Delaware
              for resolution of any dispute.
            </p>
            <p>
              If you have questions about these Terms or the Service, please
              contact us at:{" "}
              <a
                href="mailto:legal@clearcost.com"
                className="hover:underline"
                style={{ color: "var(--cc-primary)" }}
              >
                legal@clearcost.com
              </a>
            </p>
          </div>
        </section>
      </div>
    </article>
  );
}
