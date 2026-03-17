import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Medical & Data Disclaimers — ClearCost",
};

const TABLE_OF_CONTENTS = [
  { id: "not-a-medical-device", label: "Not a Medical Device" },
  { id: "no-medical-advice", label: "No Medical Advice" },
  { id: "ai-interpretation-limitations", label: "AI Interpretation Limitations" },
  { id: "price-data-limitations", label: "Price Data Limitations" },
  { id: "professional-fees", label: "Professional Fees" },
  { id: "billing-code-accuracy", label: "Billing Code Accuracy" },
  { id: "insurance-and-coverage", label: "Insurance & Coverage" },
];

export default function DisclaimersPage() {
  return (
    <article>
      {/* Title */}
      <div className="mb-8">
        <h1
          className="text-3xl sm:text-4xl mb-2"
          style={{ fontFamily: "var(--font-instrument-serif)", color: "var(--cc-text)" }}
        >
          Medical &amp; Data Disclaimers
        </h1>
        <p className="text-sm" style={{ color: "var(--cc-text-tertiary)" }}>
          Last updated: March 2026
        </p>
      </div>

      {/* Table of Contents */}
      <nav
        className="mb-10 p-4 rounded-xl border text-sm"
        style={{ borderColor: "var(--cc-border)", background: "var(--cc-surface-alt)" }}
        aria-label="Table of contents"
      >
        <p className="font-medium mb-3" style={{ color: "var(--cc-text)" }}>
          On this page
        </p>
        <ol className="space-y-1.5 list-none">
          {TABLE_OF_CONTENTS.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="hover:underline transition-colors"
                style={{ color: "var(--cc-primary)" }}
              >
                {index + 1}. {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Sections */}
      <div className="space-y-10">
        {/* Section 1 — Not a Medical Device (teal callout) */}
        <section id="not-a-medical-device">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            1. Not a Medical Device
          </h2>
          <div
            className="rounded-xl p-5 border"
            style={{
              background: "var(--cc-primary-light)",
              borderColor: "var(--cc-primary-muted)",
            }}
          >
            <p className="mb-3" style={{ color: "var(--cc-text)" }}>
              ClearCost is a consumer price transparency tool, not a medical device as
              defined by the U.S. Food and Drug Administration (FDA).
            </p>
            <p className="mb-3" style={{ color: "var(--cc-text)" }}>
              ClearCost does not meet the definition of Clinical Decision Support (CDS)
              software subject to FDA oversight under Section 3060 of the 21st Century
              Cures Act. It is software that determines billing codes and provides and
              compares costs of healthcare services — a category explicitly exempt from FDA
              device regulation.
            </p>
            <p style={{ color: "var(--cc-text)" }}>
              ClearCost is not intended to diagnose, treat, cure, or prevent any disease or
              health condition. It is not a substitute for professional medical advice,
              diagnosis, or treatment. Always seek the advice of a qualified healthcare
              provider with any questions you may have regarding a medical condition.
            </p>
          </div>
        </section>

        {/* Section 2 — No Medical Advice (teal callout) */}
        <section id="no-medical-advice">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            2. No Medical Advice
          </h2>
          <div
            className="rounded-xl p-5 border"
            style={{
              background: "var(--cc-primary-light)",
              borderColor: "var(--cc-primary-muted)",
            }}
          >
            <p className="mb-3" style={{ color: "var(--cc-text)" }}>
              Nothing on this website constitutes medical advice. ClearCost does not
              provide medical recommendations, clinical guidance, or healthcare decisions
              of any kind.
            </p>
            <p className="mb-3" style={{ color: "var(--cc-text)" }}>
              The clarifying questions asked during guided search are designed solely to
              identify appropriate billing codes for price comparison purposes. These
              questions are administrative in nature — they help narrow your search to
              relevant procedure codes, not assess your health, symptoms, or clinical
              needs.
            </p>
            <p style={{ color: "var(--cc-text)" }}>
              No provider-patient relationship is created by using ClearCost. Use of this
              service does not constitute a consultation with a healthcare professional.
            </p>
          </div>
        </section>

        {/* Section 3 — AI Interpretation Limitations */}
        <section id="ai-interpretation-limitations">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            3. AI Interpretation Limitations
          </h2>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            ClearCost uses artificial intelligence (Claude by Anthropic) to translate
            plain-language descriptions of healthcare services into standardized billing
            codes (CPT, HCPCS, MS-DRG). This translation process is an approximation.
          </p>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            The billing codes your provider ultimately uses may differ from those
            identified by ClearCost based on clinical findings made at the time of
            service, the specific technique or approach used, the provider&apos;s clinical
            judgment, or other factors that cannot be known in advance.
          </p>
          <p style={{ color: "var(--cc-text)" }}>
            AI-generated code interpretations should always be verified with your
            healthcare provider or their billing department before making financial
            decisions based on price estimates from this site.
          </p>
        </section>

        {/* Section 4 — Price Data Limitations */}
        <section id="price-data-limitations">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            4. Price Data Limitations
          </h2>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Prices displayed on ClearCost are sourced from hospital Machine Readable
            Files (MRFs) published pursuant to the CMS Hospital Price Transparency Rule
            (45 C.F.R. § 180). These files represent hospitals&apos; published standard
            charges.
          </p>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Prices shown may not reflect:
          </p>
          <ul
            className="list-disc list-inside space-y-1.5 mb-3 text-sm"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <li>Negotiated rates specific to your insurance plan</li>
            <li>Your actual out-of-pocket cost after deductibles, copays, or coinsurance</li>
            <li>Additional facility fees, supply charges, or equipment costs</li>
            <li>Updates made after the hospital last published its MRF</li>
            <li>Services bundled with or required alongside the procedure</li>
          </ul>
          <p style={{ color: "var(--cc-text)" }}>
            All prices are estimates for informational purposes only. Actual charges will
            be determined by your provider at the time of service.
          </p>
        </section>

        {/* Section 5 — Professional Fees */}
        <section id="professional-fees">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            5. Professional Fees
          </h2>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Hospital charges shown on ClearCost typically represent facility fees only —
            the portion billed by the hospital for use of its facilities, equipment, and
            support staff. Facility fees generally represent approximately 70–80% of the
            total cost of a procedure.
          </p>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Professional fees — charged separately by the individual clinicians who
            perform or interpret your care, such as the surgeon, radiologist, anesthesiologist,
            or pathologist — are billed independently and do not appear in hospital MRFs.
            These fees are not included in the prices shown unless otherwise noted.
          </p>
          <p style={{ color: "var(--cc-text)" }}>
            Your total cost for a procedure will typically include both a facility
            component and one or more professional fee components. Where professional fee
            estimates are available, ClearCost will indicate this separately.
          </p>
        </section>

        {/* Section 6 — Billing Code Accuracy */}
        <section id="billing-code-accuracy">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            6. Billing Code Accuracy
          </h2>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Medical billing codes (CPT codes maintained by the American Medical
            Association, HCPCS codes maintained by CMS, and MS-DRG codes) are
            standardized nationally, but their application varies considerably in
            practice.
          </p>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            The same procedure may be billed under different codes depending on the
            clinical circumstances, anatomical approach, complexity level, provider type,
            facility type, or payer requirements. ClearCost&apos;s code interpretation
            is based on the description you provide and may not match the code your
            provider selects after clinical evaluation.
          </p>
          <p style={{ color: "var(--cc-text)" }}>
            ClearCost does not guarantee that the codes displayed represent the codes that
            will be used for your specific encounter. Always confirm billing codes with
            your provider prior to service.
          </p>
        </section>

        {/* Section 7 — Insurance & Coverage */}
        <section id="insurance-and-coverage">
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--cc-primary)" }}
          >
            7. Insurance &amp; Coverage
          </h2>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            ClearCost currently displays self-pay and cash prices from hospital MRFs.
            These are the rates hospitals publish for patients without insurance or those
            paying out of pocket, and are not insurance-specific negotiated rates.
          </p>
          <p className="mb-3" style={{ color: "var(--cc-text)" }}>
            Your actual out-of-pocket cost if you have insurance will depend on your
            specific plan design, including your deductible, copay, coinsurance, annual
            out-of-pocket maximum, and network status of the provider. Coverage for a
            procedure may also depend on prior authorization, medical necessity
            determination, or other plan requirements.
          </p>
          <p style={{ color: "var(--cc-text)" }}>
            Always verify coverage, prior authorization requirements, and estimated costs
            directly with your insurance provider before scheduling a procedure.
          </p>
        </section>

        {/* Footer note */}
        <div
          className="pt-6 border-t text-sm"
          style={{ borderColor: "var(--cc-border)", color: "var(--cc-text-tertiary)" }}
        >
          <p>
            Questions about these disclaimers? Contact us at{" "}
            <a
              href="mailto:hello@clearcost.health"
              className="hover:underline"
              style={{ color: "var(--cc-primary)" }}
            >
              hello@clearcost.health
            </a>
            .
          </p>
        </div>
      </div>
    </article>
  );
}
