# Regulatory Disclaimers Design Spec

**Issue:** [#82 — Research and add regulatory disclaimers](https://github.com/achrispratt/clearcost/issues/82)
**Date:** 2026-03-16
**Status:** Draft

## Problem

ClearCost uses AI to interpret plain-English healthcare queries and translate them into billing codes. The guided search flow asks clinically-flavored clarifying questions ("Where is the pain?", "What type of imaging?") that could be perceived as medical advice or diagnosis, even though the tool is purely a price transparency tool.

Before public launch, we need:

1. Thorough regulatory research to understand ClearCost's classification and obligations
2. Contextual in-app disclaimers that protect users without undermining the warm, trustworthy brand
3. Full legal pages (Terms of Service, Privacy Policy, Medical Disclaimers)

## Approach

**Research-first, then implement.** The regulatory research produces a standalone deliverable (`docs/regulatory-research.md`) that informs all disclaimer content and placement decisions. This document also serves as a reference for lawyer review and SBIR grant applications (demonstrating regulatory awareness).

## Part 1: Research Deliverable

**Output:** `docs/regulatory-research.md`

### 1.1 — Federal Regulatory Analysis

#### FDA Clinical Decision Support (CDS) Framework

- Analyze ClearCost's classification under Section 3060 of the 21st Century Cures Act
- The FDA's 4-category CDS framework distinguishes administrative/financial tools from clinical tools
- Key question: Does a billing code translator that asks clarifying questions about symptoms/anatomy fall under FDA regulation?
- ClearCost's likely classification: Category A (not a device) — it does not diagnose, treat, cure, or prevent disease; it translates user descriptions into billing codes for price comparison
- Document the specific criteria and why ClearCost meets/doesn't meet each

#### FTC Health Claims

- Review FTC Section 5 (unfair/deceptive practices) as applied to health-adjacent consumer tools
- Survey any FTC enforcement actions against AI health tools (2023-2026)
- Key question: What claims must ClearCost avoid making?
- Focus areas: accuracy claims about pricing, implied medical authority from AI-generated questions

#### HIPAA Applicability

- ClearCost does not collect PHI (no patient data, insurance info, or medical records stored)
- Document why the tool falls outside HIPAA's scope (not a covered entity or business associate)
- Disclaimers should reinforce that search queries are not medical records

### 1.2 — State Regulatory Survey

Survey state-level requirements across three categories:

#### AI-in-Healthcare Laws

- Colorado AI Act (SB 21-169, effective 2026): transparency requirements for high-risk AI systems
- California (AB 2013, SB 1120): AI disclosure requirements in healthcare contexts
- Illinois (HB 3563): AI in healthcare decision-making
- New York: proposed AI regulation in healthcare
- Determine which, if any, apply to a price transparency tool (vs. clinical AI)

#### Consumer Protection Requirements

- State-specific consumer protection statutes for health-adjacent tools
- Any state that requires specific disclaimer language or consent mechanisms

#### Map Output

- Create a table: state | relevant law | applies to ClearCost? | required action
- Focus on states with the most hospital data in ClearCost's database

### 1.3 — Competitor Disclaimer Audit

Structured teardown of how comparable tools handle disclaimers. For each: exact language used, placement, prominence, legal page structure.

#### Price Transparency Tools (Direct Comparables)

- **GoodRx** — dominant consumer brand, pharmacy-first but expanding into procedures
- **Sidecar Health** — cash-pay health plan + cost calculator (design reference for ClearCost)
- **MDsave** — direct-to-consumer marketplace
- **Sesame Care** — consumer marketplace with membership model
- **Turquoise Health** — B2B focus but has consumer-facing elements

#### AI Diagnostic Tools (Stronger Precedent)

These tools ask clinically-flavored questions far more diagnostic than ClearCost's, making them excellent precedent for disclaimer requirements:

- **Ada Health** — AI symptom assessment, CE-marked medical device in EU
- **Buoy Health** — AI symptom checker, used by health systems
- **K Health** — AI-powered primary care + telehealth

#### Booking/Search

- **Zocdoc** — appointment booking with symptom-based search

#### Insurer Cost Estimators

- **UnitedHealthcare** cost estimator
- **Aetna** cost estimator

#### Additional Competitors

- Any others found during research (cast wide net for tools starting with "O" or recently launched price transparency tools)

#### Audit Template (per competitor)

| Field                         | Detail                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| Tool name                     |                                                            |
| Type                          | Price transparency / AI diagnostic / Marketplace / Insurer |
| Asks clinical questions?      | Yes/No + examples                                          |
| Homepage disclaimer           | Exact text                                                 |
| In-flow disclaimer            | Where + exact text                                         |
| Results disclaimer            | Where + exact text                                         |
| Legal pages                   | URLs + structure                                           |
| Consent mechanism             | None / Banner / Modal / Checkbox                           |
| "Not medical advice" language | Exact text                                                 |
| FDA/regulatory claims         | Any explicit device classification statements              |

### 1.4 — Recommendations

Based on findings from 1.1-1.3:

- Specific disclaimer language recommendations (informed by competitor patterns and regulatory requirements)
- Placement strategy validation (confirm or adjust the design below)
- Any legal page sections that need additions based on state requirements
- Risk assessment: what's the actual regulatory risk level for ClearCost?

## Part 2: Implementation — In-App Disclaimers

### Design Principles

1. **Contextual relevance** — each disclaimer appears at the moment a user might have a misconception, not dumped generically
2. **Subtle and warm** — small, contextual notes that fit the editorial aesthetic; trustworthy, not defensive
3. **Non-redundant** — each surface says something different; no copy-paste of the same disclaimer everywhere
4. **Progressive disclosure** — brief in-app notes link to comprehensive legal pages for users who want full detail

### 2.1 — Global Footer Component

**New component:** `components/Footer.tsx`
**Location:** Added to root layout (`app/layout.tsx`), appears on every page below `<main>`

**Content:**

- Links: Terms of Service · Privacy Policy · Disclaimers · About
- Copyright: "(c) 2026 ClearCost. Not a medical device."
- One-liner: "ClearCost helps you compare hospital prices. It does not provide medical advice, diagnosis, or treatment recommendations."

**Design:**

- Dark background (#1a1a1a), light text (#999)
- Links in a horizontal row, centered
- Small text (11-13px)
- Replaces/supplements ad-hoc footers on individual pages

**Architecture consideration:** The homepage currently has its own inline footer with data attribution. The global footer sits below it. They serve different purposes — the page-level footer is about data sources; the global footer is about legal identity.

### 2.2 — Homepage Footer Enhancement

**File:** `app/page.tsx` (existing footer section)
**Change:** Add one line to the existing data attribution footer

**Current:**

> Data sourced from hospital Machine Readable Files (MRFs) as required by CMS. Prices shown are self-pay / cash rates and may not reflect your final cost.

**Add below:**

> ClearCost is a price transparency tool — it does not provide medical advice, diagnosis, or treatment recommendations. [Full disclaimers](/legal/disclaimers)

**Design:**

- New text in teal (#0F766E) with slightly bolder weight (500) to visually distinguish from the data attribution above
- "Full disclaimers" is a link to `/legal/disclaimers`

### 2.3 — Guided Search Info Banner

**File:** `app/guided-search/page.tsx`
**Location:** Above the breadcrumb trail, below the compact search bar. Appears once at the start of clarification, persists throughout the Q&A flow.

**Content:**

> (i) These questions help us find the right billing code for your price search. This is not a medical assessment.

**Design:**

- Light teal background (#f0fdf9), teal border (1px solid #99f6e4)
- Rounded corners (8px), compact padding (10px 14px)
- Info icon ((i)) in teal, text in teal (#0F766E)
- 13px font size
- Non-dismissible but visually unobtrusive

### 2.4 — Guided Search Existing Disclaimer (Refine)

**File:** `app/guided-search/page.tsx` (lines 136-142)
**Change:** Refine language based on research findings

**Current:**

> This tool helps you find pricing, not diagnose conditions. Always consult a healthcare provider for medical advice.

**Refined (draft, final language informed by research):**

> ClearCost is a price comparison tool, not a medical service. Always consult a healthcare provider for medical decisions.

**Design:** Keep current placement and styling (centered, 12px, tertiary color).

### 2.5 — Results Page: Code Accuracy Note

**File:** `app/results/page.tsx` (inside InterpretationBanner expanded section)
**Location:** After the code chips, inside the expandable detail area

**Content:**

> These codes are our interpretation of your search. Your provider may bill differently — confirm codes and pricing before your visit.

**Design:**

- Light background (#fafaf8), 6px border-radius
- 12px text, tertiary color (#999)
- Only visible when the interpretation banner is expanded (progressive disclosure)

### 2.6 — Results Page Footer

**File:** `app/results/page.tsx`
**Location:** Below the ResultsList/MapView, above the global footer

**Content:**

> Prices sourced from hospital Machine Readable Files (MRFs) required by CMS. Cash/self-pay rates may not reflect your final cost. ClearCost is a price transparency tool — it does not provide medical advice, diagnosis, or treatment recommendations. [Full disclaimers](/legal/disclaimers)

**Design:**

- Border-top separator, centered text
- 12px, tertiary color
- "Full disclaimers" link in teal

## Part 3: Legal Pages

Three new pages under `/legal/`. Each is a full legal document (not a placeholder).

### Route Structure

```
app/
  legal/
    layout.tsx        — Shared layout for all legal pages (sidebar nav + content area)
    terms/page.tsx    — Terms of Service
    privacy/page.tsx  — Privacy Policy
    disclaimers/page.tsx — Medical & Data Disclaimers
```

### 3.1 — Shared Legal Layout

**File:** `app/legal/layout.tsx`

**Design:**

- Clean editorial layout matching ClearCost's warm aesthetic
- Optional sidebar or top navigation linking between the three legal pages
- "Last updated: [date]" below each page title
- Table of contents at the top of each page (anchor links)
- Max width ~700px for readability

### 3.2 — Terms of Service (`/legal/terms`)

**Sections:**

1. Acceptance of Terms
2. Description of Service — what ClearCost is (price transparency tool using AI)
3. Not Medical Advice — **key section**, bold callout: "ClearCost is not a medical device, clinical decision support system, or healthcare provider." Explicitly states clarifying questions are administrative, not clinical.
4. Data Sources & Accuracy — MRF data, price variability, "always confirm with provider"
5. User Accounts & Saved Searches — Google OAuth, what's stored, RLS
6. AI-Powered Features — Claude API usage, interpretation is approximate, codes may differ from provider's
7. Limitation of Liability — standard limitation, specific carve-out for medical decisions made based on ClearCost data
8. Intellectual Property
9. Modifications to Service
10. Governing Law

### 3.3 — Privacy Policy (`/legal/privacy`)

**Sections:**

1. Information We Collect — search queries, location, Google account (if signed in)
2. How We Use Your Information — price search, saved searches, service improvement
3. Information We Do NOT Collect — **key section**: no PHI, no insurance info, no SSN, no medical records. "Your search queries describe procedures you are researching — they are not medical records."
4. Third-Party Services — Supabase, Anthropic Claude API (queries sent for processing), Google Maps, Vercel
5. Data Retention — how long data is kept, user deletion rights
6. Your Rights — access, deletion, portability
7. Children's Privacy — COPPA compliance (service not directed at children under 13)
8. Changes to This Policy

### 3.4 — Medical & Data Disclaimers (`/legal/disclaimers`)

**Sections:**

1. Not a Medical Device — FDA CDS framework reference: "does not meet the definition of Clinical Decision Support software under Section 3060 of the 21st Century Cures Act"
2. No Medical Advice — clarifying questions are administrative billing code identification, not clinical assessment
3. AI Interpretation Limitations — translations are approximations, actual codes may differ, verify with provider
4. Price Data Limitations — MRF source, may not include all fees, may not reflect actual OOP cost, changes since last update
5. Professional Fees — facility fees vs. professional fees, radiology reading, anesthesia, pathology
6. Billing Code Accuracy — code interpretation caveats, provider billing variance
7. Insurance & Coverage — tool shows cash/self-pay rates, not insurance-specific pricing (yet)

### 3.5 — Design Consistency

All legal pages use:

- `Instrument Serif` for page titles (matching site heading style)
- `DM Sans` for body text
- Warm white background (#FAFAF8)
- Teal (#0F766E) for section headers and key callout borders
- Highlighted callout boxes (light teal background + left teal border) for the most critical disclaimers
- Standard ClearCost CSS custom properties (`--cc-*`)

## Component Architecture

```
components/
  Footer.tsx              — NEW: global footer (legal links + one-liner disclaimer)

app/
  layout.tsx              — MODIFY: add <Footer /> after <main>
  page.tsx                — MODIFY: expand existing footer with medical disclaimer line
  guided-search/page.tsx  — MODIFY: add info banner + refine existing disclaimer
  results/page.tsx        — MODIFY: add code accuracy note in InterpretationBanner + results footer
  legal/
    layout.tsx            — NEW: shared legal page layout
    terms/page.tsx        — NEW: Terms of Service
    privacy/page.tsx      — NEW: Privacy Policy
    disclaimers/page.tsx  — NEW: Medical & Data Disclaimers
```

## Data Flow

No database changes. No API changes. No new environment variables. This is purely frontend content + a research document.

The only dynamic element is the "Last updated" date on legal pages, which can be hardcoded and updated manually when legal content changes.

## Implementation Sequence

1. **Research phase** — produce `docs/regulatory-research.md`
2. **Finalize disclaimer language** — adjust draft language based on research findings
3. **Create `Footer.tsx`** — global footer component
4. **Add Footer to root layout** — `app/layout.tsx`
5. **Expand homepage footer** — `app/page.tsx`
6. **Add guided search info banner** — `app/guided-search/page.tsx`
7. **Refine guided search disclaimer** — same file
8. **Add results code accuracy note** — `app/results/page.tsx` (InterpretationBanner)
9. **Add results footer** — `app/results/page.tsx`
10. **Create legal layout** — `app/legal/layout.tsx`
11. **Create Terms of Service** — `app/legal/terms/page.tsx`
12. **Create Privacy Policy** — `app/legal/privacy/page.tsx`
13. **Create Medical Disclaimers** — `app/legal/disclaimers/page.tsx`
14. **Verify all pages render correctly** — visual QA

## Success Criteria

- [ ] Research document covers FDA CDS, FTC, state laws, and 10+ competitor disclaimer audits
- [ ] Global footer appears on all pages with links to legal pages
- [ ] Homepage footer includes medical disclaimer language
- [ ] Guided search has contextual info banner explaining purpose of questions
- [ ] Results page has code accuracy note in expanded interpretation and a footer disclaimer
- [ ] All three legal pages are accessible, well-structured, and use ClearCost's design language
- [ ] All disclaimer language is informed by research findings, not boilerplate
- [ ] No consent modals or friction-adding patterns — disclaimers are subtle and warm
- [ ] CI passes (lint, type check, build)

## Out of Scope

- Cookie consent banner (separate issue, depends on analytics/tracking decisions)
- About page (mentioned in global footer links but not part of this issue)
- Consent modal or checkbox before using guided search (rejected in design phase — too much friction)
- International regulatory compliance (EU/UK — not needed for US-only MVP)

## Risks

| Risk                                          | Likelihood | Mitigation                                                                                                                     |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Research reveals unexpected state requirement | Low        | Research phase happens first; adjust implementation if needed                                                                  |
| Legal pages need lawyer review before launch  | Expected   | Pages are marked "Last updated" and structured for easy lawyer review; this is a pre-launch blocker anyway                     |
| Disclaimers feel too clinical or defensive    | Low        | Design principle is "subtle and warm"; mockups approved by user                                                                |
| FDA classification is ambiguous               | Low        | Strong precedent from Ada Health, Buoy Health (actual diagnostic tools operating with disclaimers); ClearCost is less clinical |
