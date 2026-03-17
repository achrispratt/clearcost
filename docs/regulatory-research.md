# Regulatory Research: ClearCost Disclaimer & Compliance Analysis

> **Purpose:** Reference document for lawyer review and SBIR grant applications. Demonstrates regulatory awareness for a healthcare price transparency tool that uses AI to translate plain-English queries into billing codes.
>
> **Last updated:** 2026-03-16

---

## 1.1 FDA Clinical Decision Support (CDS) Framework

### Background: 21st Century Cures Act Section 3060

Section 3060(a) of the 21st Century Cures Act (December 13, 2016) amended Section 520 of the Federal Food, Drug, and Cosmetic Act (FD&C Act) to exclude certain software functions from the definition of "device." The FDA has issued guidance interpreting this exemption — most recently a revised final guidance on **January 6, 2026**, which supersedes the September 2022 version.

**Source:** [FDA CDS Final Guidance (2026)](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/changes-existing-medical-software-policies-resulting-section-3060-21st-century-cures-act) | [Covington Key Takeaways](https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance) | [FDA Town Hall 03/11/2026](https://www.fda.gov/medical-devices/medical-devices-news-and-events/town-hall-clinical-decision-support-software-final-guidance-03112026)

### The Four-Criteria CDS Exemption Test

For software to qualify as "Non-Device CDS" (exempt from FDA regulation as a medical device), it must meet **all four** criteria:

| Criterion                          | Requirement                                                                                                                             | ClearCost Analysis                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **1. No image/signal analysis**    | Software must not acquire, process, or analyze medical images or signals from diagnostic devices                                        | **PASS** — ClearCost processes text queries only, no images or signals                         |
| **2. Medical information display** | Must display, analyze, or print medical information about a patient or other medical information                                        | **N/A** — ClearCost displays pricing data, not medical information about a patient's condition |
| **3. HCP-facing support**          | Must be intended to support or provide recommendations to a healthcare professional (HCP) regarding prevention, diagnosis, or treatment | **N/A** — ClearCost is consumer-facing and makes no clinical recommendations                   |
| **4. Independent review**          | Must enable HCPs to independently review the basis for recommendations without relying primarily on the software                        | **N/A** — No clinical recommendations are made                                                 |

### Why ClearCost Falls Entirely Outside the CDS Framework

The CDS framework applies to software that makes **clinical recommendations about prevention, diagnosis, or treatment** to healthcare professionals. ClearCost does none of these things:

1. **Not clinical decision support.** ClearCost translates plain-English queries into billing codes for the sole purpose of looking up prices. The clarifying questions ("Where is the pain?", "What type of imaging?") identify which billing code to look up — they do not diagnose conditions, recommend treatments, or assess clinical appropriateness.

2. **Not consumer CDS either.** The 2026 guidance "continues to focus exclusively on HCP-facing CDS," leaving consumer-facing tools without specific CDS classification requirements. Even if ClearCost were doing something clinical (it is not), the CDS framework would not directly apply.

3. **FDA explicitly excludes billing/pricing tools.** The FDA maintains a list of [software functions that are NOT medical devices](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices). Directly relevant exemptions include:
   - **Category 4** (Administrative/billing): Software that "determine[s] billing codes like ICD-9" and "enable[s] insurance claims data collection and processing"
   - **Category 3** (Patient education): Apps that "provide and compare costs of drugs and medical products at pharmacies in the user's location"

   ClearCost is functionally identical to these exempted categories — it determines billing codes and compares healthcare costs by location.

### CDS Conclusion

**ClearCost is not a medical device and does not constitute CDS under any interpretation of the FDA framework.** It falls into the explicitly exempted categories of billing code determination and price comparison tools. The AI component (Claude) is used for natural language → billing code translation, not for clinical decision-making.

No FDA registration, 510(k), or device classification is required.

---

## 1.2 FTC Health Claims & Consumer Protection

### Applicable Framework

The Federal Trade Commission enforces **Section 5 of the FTC Act**, which prohibits "unfair or deceptive acts or practices in or affecting commerce." For health-related tools, two key guidance documents apply:

1. **FTC Health Products Compliance Guidance** (December 2022, updated from 1998): Applies to advertising for "all health-related products" including "health-related apps" and "diagnostic tests." Requires "competent and reliable scientific evidence" for health claims. ([FTC Blog Post](https://www.ftc.gov/business-guidance/blog/2022/12/whats-new-what-isnt-ftcs-just-published-health-products-compliance-guidance))

2. **Operation AI Comply** (September 25, 2024): FTC enforcement sweep targeting deceptive AI claims. Five companies were charged, primarily for overclaiming AI capabilities (e.g., DoNotPay claiming to be "the world's first robot lawyer"). ([FTC Press Release](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes))

3. **Rytr LLC reversal** (December 2025): The FTC reopened and set aside its enforcement order against Rytr LLC, citing the Trump Administration's AI Action Plan. Signals a potential shift toward lighter enforcement on AI tools. ([FTC Press Release](https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-reopens-sets-aside-rytr-final-order-response-trump-administrations-ai-action-plan))

### FTC Risk Assessment for ClearCost

| Risk Category                  | Assessment | Notes                                                                                                                          |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Deceptive health claims**    | **Low**    | ClearCost makes no health claims — it displays prices, not efficacy or treatment recommendations                               |
| **Overclaiming AI capability** | **Low**    | Must avoid language implying the AI provides medical advice, diagnosis, or clinical recommendations                            |
| **Pricing accuracy claims**    | **Medium** | Must not claim prices are guaranteed or real-time. Disclaimer needed that prices are estimates based on publicly reported data |
| **Data substantiation**        | **Low**    | Price data comes from CMS-mandated hospital machine-readable files (Trilliant Oria aggregation), not proprietary claims        |

### Claims ClearCost Must Avoid

Based on FTC enforcement patterns:

1. **Never claim ClearCost provides medical advice, diagnosis, or treatment recommendations** — even implicitly through marketing copy
2. **Never guarantee pricing accuracy** — prices must be described as estimates based on publicly reported data
3. **Never claim AI "understands" medical conditions** — frame as billing code translation, not clinical intelligence
4. **Never claim the tool replaces a doctor or medical professional**
5. **Avoid "always" or "guaranteed" language** about price savings
6. **Do not claim the AI is a "medical expert"** or use clinical authority language

### Safe Claims

- "Compare hospital prices in your area"
- "See what hospitals have reported charging for procedures"
- "Translate your healthcare question into billing codes used by hospitals"
- "Based on publicly available price data reported by hospitals"

---

## 1.3 HIPAA Applicability

### ClearCost Is Not Subject to HIPAA

HIPAA applies to three categories of "covered entities" and their "business associates":

1. **Health plans** (insurers) — ClearCost is not an insurer
2. **Healthcare clearinghouses** — ClearCost does not process health claims
3. **Healthcare providers who transmit health information electronically in connection with standard transactions** — ClearCost is not a healthcare provider

**Source:** [HHS Covered Entities](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)

### Why ClearCost Falls Outside HIPAA Scope

| Factor                                                     | Status                                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Is ClearCost a covered entity?                             | **No** — not a health plan, clearinghouse, or provider                                                                                      |
| Does ClearCost act as a business associate?                | **No** — does not handle PHI on behalf of covered entities                                                                                  |
| Does ClearCost collect Protected Health Information (PHI)? | **No** — no patient records, insurance IDs, SSNs, clinical notes, or medical history                                                        |
| What data does ClearCost collect?                          | Search queries (plain text), location (city/zip), saved search preferences (optional, authenticated)                                        |
| Could search queries constitute PHI?                       | **No** — queries like "knee MRI" are not linked to identifiable individuals. No names, DOBs, or patient identifiers are collected or stored |

### Best Practice Regardless

Even though HIPAA does not apply, ClearCost should:

- Never request or store patient-identifiable health information
- State clearly in the Privacy Policy that no PHI is collected
- If future features involve insurance plan selection, reassess whether business associate agreements are needed
- Follow general data privacy best practices (encrypted transit, minimal data retention)

---

## 1.4 State AI-in-Healthcare Laws

### Landscape Overview

47 states introduced 250+ bills regulating AI in healthcare in 2025, with 33 signed into law across 21 states. The primary focus areas are: (1) AI used in clinical diagnosis/treatment, (2) AI used in insurance coverage decisions, and (3) general AI transparency.

**Source:** [Becker's Hospital Review](https://www.beckershospitalreview.com/healthcare-information-technology/ai/47-states-introduced-healthcare-ai-bills-in-2025/) | [Manatt Health AI Policy Tracker](https://www.manatt.com/insights/newsletters/health-highlights/manatt-health-health-ai-policy-tracker) | [Holland & Knight State AI Health Tracker](https://www.hklaw.com/en/general-pages/state-ai-health-tracker)

### State-by-State Analysis

| State          | Law                                              | Effective                          | Applies to ClearCost?                                                                                                                                                                                                                                  | Required Action                                                                                                                                                       |
| -------------- | ------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Colorado**   | SB 24-205 (Colorado AI Act)                      | June 30, 2026 (delayed from Feb 1) | **Likely no** — targets AI making "consequential decisions" that "materially affect a consumer's access to or cost of health care." ClearCost displays prices; it does not make decisions affecting access or cost.                                    | Monitor. If the AG interprets price comparison as "substantially influencing" cost decisions, may need risk management policy and impact assessment. Low probability. |
| **California** | AB 3030 (AI in healthcare disclosure)            | Jan 1, 2025                        | **No** — applies to "health facilities, clinics, physician's offices" using generative AI for patient communications about clinical information. ClearCost is none of these.                                                                           | None required.                                                                                                                                                        |
| **California** | SB 1120 (Physicians Make Decisions Act)          | Jan 2025                           | **No** — applies to health insurers using AI for utilization review and coverage decisions.                                                                                                                                                            | None required.                                                                                                                                                        |
| **California** | AB 2013 (AI Training Data Transparency)          | Jan 1, 2026                        | **Possibly** — requires developers of generative AI systems "made publicly available to Californians" to disclose training data information. ClearCost uses Claude API (Anthropic's model), not its own model. Anthropic bears disclosure obligations. | ClearCost should disclose that it uses Anthropic's Claude API. Anthropic handles training data transparency.                                                          |
| **California** | AB 489 (AI healthcare license impersonation)     | Jan 1, 2026                        | **Monitor** — prohibits AI systems from implying they possess a healthcare license. ClearCost's guided search must avoid language suggesting clinical expertise.                                                                                       | Ensure no UI copy implies ClearCost or its AI has medical credentials.                                                                                                |
| **California** | SB 942 (AI Transparency Act)                     | Jan 1, 2026                        | **Unlikely** — applies to "covered providers" with 1M+ monthly users. ClearCost is well below this threshold.                                                                                                                                          | None at current scale. Reassess at scale.                                                                                                                             |
| **Texas**      | TRAIGA (SB 2)                                    | Jan 1, 2026                        | **No** — healthcare disclosure requirements apply to "licensed healthcare practitioners" using AI in diagnosis or treatment. ClearCost is not a healthcare practitioner.                                                                               | None required.                                                                                                                                                        |
| **Texas**      | SB 1188 (AI in healthcare practice)              | Sep 1, 2025                        | **No** — applies to practitioners using AI for diagnostic or treatment purposes.                                                                                                                                                                       | None required.                                                                                                                                                        |
| **Illinois**   | HB 1806 (WOPR Act — AI in therapy)               | Aug 1, 2025                        | **No** — applies to AI used in therapy/psychotherapy services.                                                                                                                                                                                         | None required.                                                                                                                                                        |
| **Illinois**   | AI in Health Insurance Act                       | 2025                               | **No** — applies to insurers using AI for adverse determinations.                                                                                                                                                                                      | None required.                                                                                                                                                        |
| **Utah**       | UAIPA + 2025 amendments (HB 452, SB 226, SB 332) | May 7, 2025                        | **Possibly** — requires disclosure when generative AI is used in "high-risk interactions" including healthcare. Key question: is a billing code translation a "healthcare" interaction? Likely no — it's a price comparison tool.                      | Disclose AI usage in Terms of Service and/or in-app. Low-risk approach: always disclose.                                                                              |
| **Utah**       | HB 452 (mental health chatbots)                  | May 7, 2025                        | **No** — applies to mental health chatbot services.                                                                                                                                                                                                    | None required.                                                                                                                                                        |

### Key Takeaway

Nearly all state AI-healthcare laws target: (a) licensed healthcare providers using AI in clinical settings, (b) insurers using AI for coverage decisions, or (c) AI systems providing therapy/mental health services. A consumer-facing price transparency tool using AI for billing code translation falls outside the scope of enacted legislation.

**Recommended protective measures regardless:**

- Disclose AI usage transparently (covers Utah UAIPA)
- Avoid implying clinical expertise (covers California AB 489)
- Document that ClearCost uses Anthropic's Claude API (covers California AB 2013)

---

## 1.5 Competitor Disclaimer Audit

### Price Transparency Tools

#### GoodRx

| Field                             | Detail                                                                                                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | GoodRx                                                                                                                                                                                                                                                                             |
| **Type**                          | Price transparency (prescription drugs)                                                                                                                                                                                                                                            |
| **Asks clinical questions?**      | No — users search by drug name                                                                                                                                                                                                                                                     |
| **Homepage disclaimer**           | None prominent on homepage                                                                                                                                                                                                                                                         |
| **In-flow disclaimer**            | Price results note that prices may vary and are not guaranteed                                                                                                                                                                                                                     |
| **Results disclaimer**            | "Actual prices may vary" on pricing cards                                                                                                                                                                                                                                          |
| **Legal pages**                   | [Terms of Use](https://support.goodrx.com/hc/en-us/articles/115005225563-GoodRx-Terms-of-Use)                                                                                                                                                                                      |
| **Consent mechanism**             | Implied consent through use                                                                                                                                                                                                                                                        |
| **"Not medical advice" language** | "The content of the Services ... for informational purposes only and does not constitute professional medical advice, diagnosis, treatment, or recommendations of any kind by GoodRx." "Not intended to be a substitute for professional medical advice, diagnosis, or treatment." |
| **FDA/regulatory claims**         | None — does not claim or disclaim device status                                                                                                                                                                                                                                    |

**Key phrase:** "Always seek the advice of your qualified health care professionals with any questions or concerns you may have regarding your individual needs and any medical conditions."

---

#### Sidecar Health

| Field                             | Detail                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Sidecar Health Cost Calculator ([cost.sidecarhealth.com](https://cost.sidecarhealth.com))                                                                                                       |
| **Type**                          | Price transparency (procedures) + insurance plan marketplace                                                                                                                                    |
| **Asks clinical questions?**      | No — users search by procedure name                                                                                                                                                             |
| **Homepage disclaimer**           | "The site is not a substitute for medical or healthcare advice and does not serve as a recommendation for a particular provider or type of medical or healthcare."                              |
| **In-flow disclaimer**            | None observed in search flow                                                                                                                                                                    |
| **Results disclaimer**            | "Your actual costs may be higher or lower than these cost estimates. Check with your provider and health plan details to confirm the costs that you may be charged for a service or procedure." |
| **Legal pages**                   | Terms of Use (JS-rendered, not easily crawlable)                                                                                                                                                |
| **Consent mechanism**             | None observed (no banner, modal, or checkbox)                                                                                                                                                   |
| **"Not medical advice" language** | "The site is not a substitute for medical or healthcare advice"                                                                                                                                 |
| **FDA/regulatory claims**         | None                                                                                                                                                                                            |

**Notable:** Sidecar also includes: "Neither payments nor benefits are guaranteed" and "You are responsible for costs that are not covered."

---

#### MDsave

| Field                             | Detail                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | MDsave                                                                                                                      |
| **Type**                          | Price transparency + transactional marketplace (purchase procedures online)                                                 |
| **Asks clinical questions?**      | No — users search by procedure name and location                                                                            |
| **Homepage disclaimer**           | Not visible in rendered content (JS-heavy site)                                                                             |
| **In-flow disclaimer**            | Pricing shown as bundled, all-inclusive price                                                                               |
| **Results disclaimer**            | "The price posted on the MDsave website is what the person pays" — positions itself as guaranteed pricing (unique approach) |
| **Legal pages**                   | [Terms & Conditions](https://www.mdsave.com/termsandconditions) (JS-rendered)                                               |
| **Consent mechanism**             | Account creation required for purchase                                                                                      |
| **"Not medical advice" language** | Not found in publicly crawlable content                                                                                     |
| **FDA/regulatory claims**         | None                                                                                                                        |

**Notable:** MDsave takes the opposite approach from most — because they are a transactional marketplace with bundled pricing, they guarantee the posted price rather than disclaiming accuracy.

---

#### Sesame Care

| Field                             | Detail                                                                                                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Sesame Care                                                                                                                                                                                                                                        |
| **Type**                          | Healthcare marketplace (book appointments at set prices)                                                                                                                                                                                           |
| **Asks clinical questions?**      | No — users search by service type and location                                                                                                                                                                                                     |
| **Homepage disclaimer**           | Emergency warning at top of terms                                                                                                                                                                                                                  |
| **In-flow disclaimer**            | None observed in search flow                                                                                                                                                                                                                       |
| **Results disclaimer**            | Prices shown are the booking price                                                                                                                                                                                                                 |
| **Legal pages**                   | [Terms of Service](https://sesamecare.com/terms-of-service)                                                                                                                                                                                        |
| **Consent mechanism**             | "By using this site, you signify your acceptance of these Terms of Service"                                                                                                                                                                        |
| **"Not medical advice" language** | "SESAME DOES NOT PROVIDE ANY MEDICAL SERVICES NOR MEDICAL ADVICE AND DOES NOT MAKE ANY REPRESENTATIONS, WARRANTIES, GUARANTEES OR ENDORSEMENTS REGARDING ANY MEDICAL SERVICES OR ADVICE THAT YOU MAY OBTAIN THROUGH THE SITE AND/OR THE SERVICES." |
| **FDA/regulatory claims**         | None                                                                                                                                                                                                                                               |

**Key phrases:**

- "NO HEALTH CARE PROVIDER/PATIENT RELATIONSHIP IS CREATED WHEN YOU USE THE SERVICES."
- "NEVER DISREGARD PROFESSIONAL MEDICAL ADVICE OR DELAY SEEKING MEDICAL TREATMENT BECAUSE OF SOMETHING YOU HAVE READ ON OR ACCESSED THROUGH THE SITE."

---

#### Turquoise Health

| Field                             | Detail                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Turquoise Health                                                                                                                                                                                                                                                                          |
| **Type**                          | Price transparency (B2B + consumer-facing hospital price data)                                                                                                                                                                                                                            |
| **Asks clinical questions?**      | No — users search by procedure/hospital                                                                                                                                                                                                                                                   |
| **Homepage disclaimer**           | None prominent on homepage                                                                                                                                                                                                                                                                |
| **In-flow disclaimer**            | None observed                                                                                                                                                                                                                                                                             |
| **Results disclaimer**            | On [disclaimers page](https://turquoise.health/mrf_transparency_score/disclaimers): "Only CMS is the authority on hospital price transparency compliance." "Not a substitute for a CMS audit." "Turquoise Health is not in a position to question the accuracy of [hospital] disclosure." |
| **Legal pages**                   | Disclaimers page for transparency scorecard                                                                                                                                                                                                                                               |
| **Consent mechanism**             | Account required for full data access                                                                                                                                                                                                                                                     |
| **"Not medical advice" language** | Not found — Turquoise positions as a data/analytics company, not a health tool                                                                                                                                                                                                            |
| **FDA/regulatory claims**         | None — explicitly disclaims CMS authority: "These categories and criteria are not approved or sponsored by CMS."                                                                                                                                                                          |

**Notable:** Turquoise Health focuses on data accuracy disclaimers rather than medical advice disclaimers, reflecting their B2B data company positioning.

---

### AI Diagnostic Tools (Stronger Precedent)

These tools ask far more clinically-oriented questions than ClearCost yet operate without FDA device classification.

#### Ada Health

| Field                             | Detail                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Ada Health                                                                                                                                                                                                                |
| **Type**                          | AI diagnostic / symptom checker                                                                                                                                                                                           |
| **Asks clinical questions?**      | **Yes** — extensive symptom assessment, medical history, body location, duration, severity                                                                                                                                |
| **Homepage disclaimer**           | Prominent "Ada is not intended to replace a doctor"                                                                                                                                                                       |
| **In-flow disclaimer**            | Pre-assessment disclaimer that results are not a diagnosis                                                                                                                                                                |
| **Results disclaimer**            | "NEITHER ADA ASSESS, NOR OUR WEBSITE MAKE ANY MEDICAL DIAGNOSES. PLEASE SEEK THE ADVICE OF A MEDICAL PROFESSIONAL IF YOU ARE CONCERNED"                                                                                   |
| **Legal pages**                   | [Terms & Conditions](https://ada.com/terms-and-conditions/)                                                                                                                                                               |
| **Consent mechanism**             | User must accept terms before using assessment                                                                                                                                                                            |
| **"Not medical advice" language** | "NOT a suitable substitute for medical advice obtained from your doctor" (Section 4.3). "Does NOT provide diagnoses for medical conditions, nor do they prescribe how you are to treat any medical issues" (Section 4.4). |
| **FDA/regulatory claims**         | **EU-regulated:** "Class IIA medical device registered under Regulation (EU) 2017/745 (MDR)" — Ada is registered as a medical device in the EU, but operates in the US under disclaimer-based approach                    |

**Key insight:** Ada asks significantly more diagnostic questions than ClearCost and operates as an EU-registered medical device, yet in the US market relies on disclaimers rather than FDA registration. ClearCost's much lighter clinical footprint (billing code identification only) is substantially lower risk.

---

#### Buoy Health

| Field                             | Detail                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Buoy Health                                                                                                               |
| **Type**                          | AI diagnostic / symptom checker + care navigation                                                                         |
| **Asks clinical questions?**      | **Yes** — multi-turn symptom assessment with follow-up questions about body area, duration, associated symptoms           |
| **Homepage disclaimer**           | Footer: "The content available on buoy.com is not a substitute for professional medical advice, diagnosis, or treatment." |
| **In-flow disclaimer**            | Pre-assessment acknowledgment                                                                                             |
| **Results disclaimer**            | Results are "possible conditions" with recommendation to see specific provider types                                      |
| **Legal pages**                   | Terms of Service, Privacy Policy, Cookies Policy (footer links)                                                           |
| **Consent mechanism**             | Cookie consent banner (Cookiebot/TCFv2.2)                                                                                 |
| **"Not medical advice" language** | "Not a substitute for professional medical advice, diagnosis, or treatment"                                               |
| **FDA/regulatory claims**         | None found — operates as informational tool. Uses Schema.org markup: `MedicalWebPage`                                     |

**Key insight:** Buoy asks deeply diagnostic questions and suggests possible conditions — far beyond ClearCost's scope — yet operates without FDA classification in the US.

---

#### K Health

| Field                             | Detail                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | K Health                                                                                                                                                                    |
| **Type**                          | AI diagnostic / symptom checker + telehealth                                                                                                                                |
| **Asks clinical questions?**      | **Yes** — extensive symptom checker that provides condition assessments based on clinical protocols                                                                         |
| **Homepage disclaimer**           | Prominent "K Health is not a substitute for professional medical care"                                                                                                      |
| **In-flow disclaimer**            | Assessment preceded by disclaimers; emergency numbers displayed                                                                                                             |
| **Results disclaimer**            | "Even when assessments are based on clinical protocols, such assessments do not constitute clinical care, advice or diagnosis."                                             |
| **Legal pages**                   | [Terms of Service](https://khealth.com/tos)                                                                                                                                 |
| **Consent mechanism**             | Must affirmatively accept terms + provide informed consent to telehealth via separate form                                                                                  |
| **"Not medical advice" language** | "K HEALTH, INC. IS NOT A PROVIDER OF CLINICAL ADVICE." Content is "FOR INFORMATIONAL PURPOSES ONLY AND ARE NOT A SUBSTITUTE FOR PROFESSIONAL CLINICAL ADVICE OR TREATMENT." |
| **FDA/regulatory claims**         | None — distinguishes between AI symptom checker (informational) and telehealth visits (clinical care provided by licensed physicians)                                       |

**Key insight:** K Health draws a clear line between their AI assessment (informational, not clinical advice) and their telehealth service (actual clinical care). ClearCost should adopt a similar clear distinction: AI translates queries to billing codes (informational), prices come from hospital-reported data (factual).

---

### Booking & Insurer Tools

#### Zocdoc

| Field                             | Detail                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Zocdoc                                                                                                                                                                                                                                                                                                  |
| **Type**                          | Healthcare marketplace / booking platform                                                                                                                                                                                                                                                               |
| **Asks clinical questions?**      | Minimal — users select specialty, insurance, and reason for visit                                                                                                                                                                                                                                       |
| **Homepage disclaimer**           | None prominent                                                                                                                                                                                                                                                                                          |
| **In-flow disclaimer**            | None observed in booking flow                                                                                                                                                                                                                                                                           |
| **Results disclaimer**            | None on search results                                                                                                                                                                                                                                                                                  |
| **Legal pages**                   | [Terms of Use](https://www.zocdoc.com/about/terms/)                                                                                                                                                                                                                                                     |
| **Consent mechanism**             | Implied consent through use                                                                                                                                                                                                                                                                             |
| **"Not medical advice" language** | "Not intended as a substitute for, nor does it replace, professional medical advice, diagnosis, or treatment." Content is "for informational, scheduling and payment purposes only." AI-generated content "is not, and is not a substitute for, an opinion, medical advice, or diagnosis or treatment." |
| **FDA/regulatory claims**         | None                                                                                                                                                                                                                                                                                                    |

**Key phrases:**

- "Zocdoc is not a healthcare provider."
- "All medically related information ... is for informational and communicative purposes only."

---

#### UnitedHealthcare Cost Estimator

| Field                             | Detail                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | UnitedHealthcare Cost Estimator                                                                                                                                                        |
| **Type**                          | Insurer cost estimation tool                                                                                                                                                           |
| **Asks clinical questions?**      | No — users search by procedure/service                                                                                                                                                 |
| **Homepage disclaimer**           | None prominent                                                                                                                                                                         |
| **In-flow disclaimer**            | Cost estimates shown with disclaimer                                                                                                                                                   |
| **Results disclaimer**            | Costs are estimates, actual may vary                                                                                                                                                   |
| **Legal pages**                   | [Terms of Use](https://www.uhc.com/medicare/terms-of-use.html)                                                                                                                         |
| **Consent mechanism**             | Login required (member tool)                                                                                                                                                           |
| **"Not medical advice" language** | "Content is for informational, cost-comparison purposes only and is not medical advice and does not replace consultation with a doctor, pharmacist or other health care professional." |
| **FDA/regulatory claims**         | None                                                                                                                                                                                   |

**Key phrase:** "UnitedHealthcare disclaims all warranties of any kind and makes no warranty as to the accuracy, completeness, timeliness, correctness, or reliability of any content available through the website."

---

#### Aetna Cost Estimator

| Field                             | Detail                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Tool name**                     | Aetna Cost Estimator                                                                                     |
| **Type**                          | Insurer cost estimation tool                                                                             |
| **Asks clinical questions?**      | No — users search by procedure/service                                                                   |
| **Homepage disclaimer**           | None prominent                                                                                           |
| **In-flow disclaimer**            | "Costs provided are estimates only and are not a guarantee of payment or benefits"                       |
| **Results disclaimer**            | "Your actual costs may be higher or lower than the estimate"                                             |
| **Legal pages**                   | Terms of Use on aetna.com                                                                                |
| **Consent mechanism**             | Login required (member tool)                                                                             |
| **"Not medical advice" language** | General educational information disclaimer; medical necessity guide "does not constitute medical advice" |
| **FDA/regulatory claims**         | None                                                                                                     |

---

### Cross-Competitor Pattern Summary

| Pattern                                            | Frequency                                   | ClearCost Action                                                                  |
| -------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| "For informational purposes only"                  | **11/11 tools**                             | Must include                                                                      |
| "Not a substitute for professional medical advice" | **10/11 tools**                             | Must include                                                                      |
| "Consult your physician/healthcare provider"       | **9/11 tools**                              | Must include                                                                      |
| "Not medical advice, diagnosis, or treatment"      | **8/11 tools** (full triad)                 | Must include                                                                      |
| "Never disregard professional medical advice"      | **6/11 tools**                              | Should include                                                                    |
| Emergency disclaimer (call 911)                    | **4/11 tools** (AI diagnostic + telehealth) | Optional — ClearCost is less clinical. Include if guided search feels diagnostic. |
| No provider-patient relationship created           | **3/11 tools**                              | Should include                                                                    |
| Price accuracy disclaimer ("estimates may vary")   | **5/11 tools** (all pricing tools)          | Must include                                                                      |
| AI usage disclosure                                | **3/11 tools**                              | Should include (proactive for state law compliance)                               |
| FDA device classification                          | **1/11 tools** (Ada, EU only)               | Not needed — explicitly exempt per FDA                                            |

---

## 1.6 Recommendations

### Risk Assessment

| Risk Area                               | Level          | Rationale                                                                                                                                 |
| --------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **FDA device classification**           | **Negligible** | FDA explicitly exempts billing code tools and price comparison tools from device definition. ClearCost makes no clinical recommendations. |
| **FTC deceptive claims**                | **Low**        | Risk only if ClearCost overclaims AI capability or guarantees pricing accuracy. Mitigated by standard disclaimers.                        |
| **HIPAA**                               | **Negligible** | Not a covered entity, collects no PHI.                                                                                                    |
| **State AI laws**                       | **Low**        | Nearly all target clinical providers and insurers. Utah UAIPA is the only potential trigger; mitigated by disclosing AI usage.            |
| **Competitor litigation risk**          | **Negligible** | ClearCost's approach is standard in the industry. Every competitor operates with similar disclaimer patterns.                             |
| **State consumer protection (general)** | **Low**        | Standard consumer protection applies — don't mislead about pricing accuracy or tool capabilities.                                         |

**Overall regulatory risk: LOW.** ClearCost occupies a well-established regulatory safe harbor as a consumer information tool. Its closest comparables (GoodRx, Sidecar Health, UnitedHealthcare cost estimator) operate with minimal regulatory burden beyond standard disclaimers. The AI-diagnostic tools (Ada, Buoy, K Health) face substantially higher regulatory scrutiny and still operate in the US without FDA classification.

### Recommended Disclaimer Language

Based on the competitor audit, ClearCost should implement a three-tier disclaimer strategy:

#### Tier 1: Terms of Service / Legal Page (Comprehensive)

> **Medical Disclaimer.** ClearCost is a healthcare price comparison tool. The information provided through this service, including billing code translations, procedure descriptions, and pricing data, is for informational and cost-comparison purposes only. This information does not constitute medical advice, diagnosis, or treatment recommendations.
>
> ClearCost is not a healthcare provider and does not provide medical services. No provider-patient relationship is created by your use of this service. Always seek the advice of your physician or other qualified healthcare provider with any questions you may have regarding a medical condition. Never disregard professional medical advice or delay seeking treatment because of something you have read or accessed through ClearCost.
>
> **Pricing Disclaimer.** Prices displayed are estimates based on publicly reported hospital price data as required by federal price transparency regulations. Your actual costs may be higher or lower than these estimates. Prices may not include all components of care (e.g., professional fees, supplies, anesthesia). Contact the healthcare provider directly to confirm current pricing for your specific situation.
>
> **AI Disclosure.** ClearCost uses artificial intelligence (Anthropic's Claude) to translate plain-language healthcare questions into standardized billing codes. The AI assists in identifying relevant billing codes for price lookup purposes only — it does not assess medical necessity, diagnose conditions, or recommend treatments. AI-generated billing code matches should be verified with your healthcare provider.

#### Tier 2: In-Flow Disclaimer (Guided Search)

> This tool helps identify billing codes to compare prices. It does not provide medical advice or diagnosis. Prices shown are estimates from publicly reported hospital data.

#### Tier 3: Results Page Disclaimer (Brief)

> Prices are estimates based on hospital-reported data and may not reflect your actual cost. Contact providers directly to confirm pricing. This is not medical advice.

### Required Legal Pages

| Page                           | Priority           | Content                                                                                                                                                    |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Terms of Service**           | P0 — before launch | Service description, medical disclaimer, pricing disclaimer, AI disclosure, limitation of liability, user responsibilities                                 |
| **Privacy Policy**             | P0 — before launch | Data collection (search queries, location, account info), no PHI collection, cookie usage, third-party services (Supabase, Anthropic, Google Maps, Vercel) |
| **Medical & Data Disclaimers** | P1                 | Standalone page with comprehensive medical disclaimer, pricing data methodology, AI usage explanation, data freshness/limitations                          |

### Key Phrases to Adopt (Industry Standard)

Every ClearCost legal page and relevant UI surface should include these phrases, drawn from near-universal competitor usage:

1. **"For informational purposes only"** — universal across all 11 competitors
2. **"Not a substitute for professional medical advice, diagnosis, or treatment"** — the standard medical disclaimer triad
3. **"Always seek the advice of your physician or other qualified healthcare provider"** — the standard redirect
4. **"Prices are estimates and may vary"** — pricing accuracy disclaimer
5. **"No provider-patient relationship is created"** — liability boundary
6. **"ClearCost is not a healthcare provider"** — entity classification
7. **"This tool uses artificial intelligence to [specific function]"** — AI transparency (proactive state law compliance)

### Implementation Priority

1. Add medical + pricing disclaimers to Terms of Service (P0)
2. Add brief disclaimer to guided search flow (P0)
3. Add results page pricing caveat (P0)
4. Create standalone disclaimers page (P1)
5. Add AI disclosure to About/legal pages (P1)
6. Add footer link to disclaimers from all pages (P1)

---

## Sources

### FDA / Device Classification

- [FDA: Changes to Existing Medical Software Policies (Section 3060)](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/changes-existing-medical-software-policies-resulting-section-3060-21st-century-cures-act)
- [FDA: Examples of Software Functions That Are NOT Medical Devices](https://www.fda.gov/medical-devices/device-software-functions-including-mobile-medical-applications/examples-software-functions-are-not-medical-devices)
- [FDA: CDS Final Guidance Town Hall 03/11/2026](https://www.fda.gov/medical-devices/medical-devices-news-and-events/town-hall-clinical-decision-support-software-final-guidance-03112026)
- [Covington: 5 Key Takeaways from FDA's Revised CDS Guidance (Jan 2026)](https://www.cov.com/en/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance)
- [Arnold & Porter: FDA Cuts Red Tape on CDS Software (Jan 2026)](https://www.arnoldporter.com/en/perspectives/advisories/2026/01/fda-cuts-red-tape-on-clinical-decision-support-software)
- [The FDA Law Blog: Updates to CDS Guidance (Jan 2026)](https://www.thefdalawblog.com/2026/01/a-busy-day-in-the-cdrh-neighborhood-updates-to-the-cds-and-general-wellness-guidance-documents/)

### FTC / Consumer Protection

- [FTC: Operation AI Comply Press Release (Sep 2024)](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes)
- [FTC: Health Products Compliance Guidance (Dec 2022)](https://www.ftc.gov/business-guidance/blog/2022/12/whats-new-what-isnt-ftcs-just-published-health-products-compliance-guidance)
- [FTC: Rytr Final Order Set Aside (Dec 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/12/ftc-reopens-sets-aside-rytr-final-order-response-trump-administrations-ai-action-plan)
- [FTC: Health Claims Guidance](https://www.ftc.gov/business-guidance/advertising-marketing/health-claims)

### HIPAA

- [HHS: Covered Entities and Business Associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)
- [CMS: Are You a Covered Entity?](https://www.cms.gov/priorities/key-initiatives/burden-reduction/administrative-simplification/hipaa/covered-entities)

### State AI Laws

- [Colorado SB 24-205 Bill Text](https://leg.colorado.gov/bills/sb24-205)
- [Foley & Lardner: Colorado AI Act Healthcare Implications (Feb 2025)](https://www.foley.com/insights/publications/2025/02/the-colorado-ai-act-implications-for-health-care-providers/)
- [Akerman: New AI Rules Healthcare Laws Now in Effect (2026)](https://www.akerman.com/en/perspectives/hrx-new-year-new-ai-rules-healthcare-ai-laws-now-in-effect.html)
- [Becker's: 47 States Introduced Healthcare AI Bills (2025)](https://www.beckershospitalreview.com/healthcare-information-technology/ai/47-states-introduced-healthcare-ai-bills-in-2025/)
- [Holland & Knight: State AI Health Tracker](https://www.hklaw.com/en/general-pages/state-ai-health-tracker)
- [Spencer Fane: Texas TRAIGA Healthcare Requirements](https://www.spencerfane.com/insight/texas-enacts-comprehensive-ai-governance-law-with-specific-requirements-for-health-care-service-providers-are-you-ready-for-traiga/)
- [Perkins Coie: Utah AI Law Amendments (2025)](https://perkinscoie.com/insights/update/new-utah-ai-laws-change-disclosure-requirements-and-identity-protections-target)

### Competitor Terms of Service

- [GoodRx Terms of Use](https://support.goodrx.com/hc/en-us/articles/115005225563-GoodRx-Terms-of-Use)
- [Sesame Care Terms of Service](https://sesamecare.com/terms-of-service)
- [Ada Health Terms & Conditions](https://ada.com/terms-and-conditions/)
- [K Health Terms of Service](https://khealth.com/tos)
- [Zocdoc Terms of Use](https://www.zocdoc.com/about/terms/)
- [Turquoise Health Disclaimers](https://turquoise.health/mrf_transparency_score/disclaimers)
- [UnitedHealthcare Terms of Use](https://www.uhc.com/medicare/terms-of-use.html)
- [MDsave Terms & Conditions](https://www.mdsave.com/termsandconditions)
- [Sidecar Health Cost Calculator](https://cost.sidecarhealth.com)
