# Regulatory Disclaimers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add regulatory disclaimers and legal pages to ClearCost based on thorough regulatory research, protecting users and the product before public launch.

**Architecture:** Two-phase approach: (1) research deliverable analyzing FDA/FTC/state regulations and competitor disclaimers, (2) implementation of contextual in-app disclaimers + three new legal pages. No database changes, no API changes — purely frontend content and a research document.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, DaisyUI 5, ClearCost CSS custom properties (`--cc-*`)

**Spec:** `docs/superpowers/specs/2026-03-16-regulatory-disclaimers-design.md`

---

## Chunk 1: Research Deliverable

### Task 1: Regulatory Research Document

**Files:**

- Create: `docs/regulatory-research.md`

This task is research-only — no code changes. The output is a comprehensive markdown document that informs all disclaimer language in subsequent tasks.

- [ ] **Step 1: Research FDA CDS Framework**

Web search for:

- "FDA Clinical Decision Support 21st Century Cures Act Section 3060 criteria"
- "FDA guidance software not a medical device 2024 2025"
- FDA's 4-category CDS classification (which category does a billing code translator fall into?)

Document findings in Section 1.1 of `docs/regulatory-research.md`. Key question to answer: Does ClearCost's guided search (asking "Where is the pain?" to narrow billing codes) constitute Clinical Decision Support under FDA rules?

- [ ] **Step 2: Research FTC Health Claims**

Web search for:

- "FTC Section 5 health claims consumer tools 2024 2025"
- "FTC enforcement AI health tools"
- "FTC Health Products Compliance Guidance"

Document findings in Section 1.2. Key question: What claims must ClearCost avoid? Focus on accuracy claims about pricing and implied medical authority.

- [ ] **Step 3: Research HIPAA Applicability**

Web search for:

- "HIPAA covered entity definition consumer health tool"
- "HIPAA business associate health price comparison"

Document why ClearCost falls outside HIPAA scope (not a covered entity, doesn't collect PHI). Short section — this is straightforward.

- [ ] **Step 4: Research State AI-in-Healthcare Laws**

Web search for:

- "Colorado AI Act SB 21-169 healthcare 2026"
- "California AB 2013 SB 1120 AI healthcare disclosure"
- "Illinois HB 3563 AI healthcare"
- "state AI healthcare regulation 2025 2026"

Create a table: state | relevant law | applies to ClearCost? | required action. Focus on the 4-5 states with the most stringent requirements.

- [ ] **Step 5: Competitor Disclaimer Audit — Price Transparency Tools**

Visit and document disclaimers from each (use gstack browse or web search):

- GoodRx (goodrx.com)
- Sidecar Health (cost.sidecarhealth.com)
- MDsave (mdsave.com)
- Sesame Care (sesamecare.com)
- Turquoise Health (turquoisehealth.com)

For each tool, fill in the audit template from the spec: homepage disclaimer, in-flow disclaimer, results disclaimer, legal page structure, consent mechanism, "not medical advice" language.

- [ ] **Step 6: Competitor Disclaimer Audit — AI Diagnostic Tools**

Visit and document disclaimers from:

- Ada Health (ada.com)
- Buoy Health (buoyhealth.com)
- K Health (khealth.com)

These are critical precedent — they ask far more diagnostic questions than ClearCost.

- [ ] **Step 7: Competitor Disclaimer Audit — Booking & Insurer Tools**

Visit and document disclaimers from:

- Zocdoc (zocdoc.com)
- UnitedHealthcare cost estimator
- Aetna cost estimator

Also search for any recently-launched price transparency tools (e.g., tools starting with "O" or Buoy Health's cost features).

- [ ] **Step 8: Write Recommendations Section**

Based on all research, write Section 1.4 of `docs/regulatory-research.md`:

- Specific disclaimer language recommendations (informed by competitor patterns)
- Validation or adjustment of the placement strategy from the spec
- Any legal page sections that need additions based on state requirements
- Overall risk assessment for ClearCost

- [ ] **Step 9: Commit research document**

```bash
git add docs/regulatory-research.md
git commit -m "docs: add regulatory research for disclaimers (#82)

Covers FDA CDS framework, FTC health claims, HIPAA, state AI laws,
and competitive disclaimer audit of 11+ tools."
```

### Task 1.5: Finalize Disclaimer Language

**Files:**

- None (review checkpoint only)

This is a deliberate gate between research and implementation. Do not proceed to Chunk 2 until this task is complete.

- [ ] **Step 1: Review research findings against spec draft language**

Read the Recommendations section (1.4) of `docs/regulatory-research.md`. Compare against the draft disclaimer language in the spec (Sections 2.1-2.5). Identify any language that needs updating based on:

- Regulatory requirements (e.g., specific wording mandated by a state law)
- Competitor patterns (e.g., every competitor uses a particular phrase)
- FDA classification findings (e.g., whether to reference Section 3060 explicitly)

- [ ] **Step 2: Update spec with finalized language if needed**

If research changes any draft disclaimer text in the spec, update `docs/superpowers/specs/2026-03-16-regulatory-disclaimers-design.md` with the finalized language.

- [ ] **Step 3: Commit if changes were made**

```bash
git add docs/superpowers/specs/2026-03-16-regulatory-disclaimers-design.md
git commit -m "docs: finalize disclaimer language based on regulatory research (#82)"
```

---

## Chunk 2: Legal Pages Infrastructure

### Task 2: Legal Page Layout

**Files:**

- Create: `app/legal/layout.tsx`

- [ ] **Step 1: Create the shared legal layout**

```tsx
// app/legal/layout.tsx
import Link from "next/link";

const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/disclaimers", label: "Disclaimers" },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      {/* Top navigation */}
      <nav className="flex gap-2 mb-8">
        {LEGAL_PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="text-sm px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--cc-primary)] hover:text-[var(--cc-primary)]"
            style={{
              borderColor: "var(--cc-border)",
              color: "var(--cc-text-secondary)",
            }}
          >
            {page.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

Note: The pill-style nav uses static styling. Active state highlighting requires `"use client"` + `usePathname()`. If active state is desired during implementation, add it — but the spec doesn't require it and the static version works fine for three links. Use judgment.

- [ ] **Step 2: Verify the layout renders**

```bash
# Start dev server if not running
npm run dev
# Navigate to /legal/terms in browser — should show the nav bar + empty content
```

- [ ] **Step 3: Commit**

```bash
git add app/legal/layout.tsx
git commit -m "feat(legal): add shared legal page layout with pill navigation (#82)"
```

### Task 3: Terms of Service Page

**Files:**

- Create: `app/legal/terms/page.tsx`

- [ ] **Step 1: Create Terms of Service**

Create `app/legal/terms/page.tsx` with the full Terms of Service content. This is a server component (no `"use client"` needed — it's static content).

Sections (from spec 3.2):

1. Acceptance of Terms
2. Description of Service
3. Not Medical Advice (key section — teal callout box)
4. Data Sources & Accuracy
5. User Accounts & Saved Searches
6. AI-Powered Features
7. Limitation of Liability
8. Intellectual Property
9. Modifications to Service
10. Governing Law

Use the design language from the spec:

- `font-[family-name:var(--font-instrument-serif)]` for the page title
- `--cc-primary` (#0F766E) for section headers
- Teal callout box (`bg-[#f0fdf9] border-l-4 border-[var(--cc-primary)]`) for the "Not Medical Advice" section
- Standard `--cc-text`, `--cc-text-secondary` for body text

Add a table of contents at the top with anchor links to each section.

The full text content should be informed by the research document (Task 1). Use the draft content from the mockup as a starting point, then refine based on competitor patterns and regulatory findings.

Include a "Last updated: March 2026" line below the page title (hardcoded, updated manually when content changes per spec Section 3.1).

Export page metadata:

```tsx
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Terms of Service — ClearCost",
};
```

- [ ] **Step 2: Verify page renders at /legal/terms**

Navigate to `http://localhost:3000/legal/terms` and confirm:

- Page title renders in Instrument Serif
- Table of contents links work (anchor scroll)
- "Not Medical Advice" section has the teal callout box
- Legal nav pills appear at the top

- [ ] **Step 3: Commit**

```bash
git add app/legal/terms/page.tsx
git commit -m "feat(legal): add Terms of Service page (#82)"
```

### Task 4: Privacy Policy Page

**Files:**

- Create: `app/legal/privacy/page.tsx`

- [ ] **Step 1: Create Privacy Policy**

Create `app/legal/privacy/page.tsx` with the same structure as Terms.

Sections (from spec 3.3):

1. Information We Collect
2. How We Use Your Information
3. Information We Do NOT Collect (key section — teal callout: no PHI, no insurance info, no SSN)
4. Third-Party Services (Supabase, Anthropic Claude API, Google Maps, Vercel)
5. Data Retention
6. Your Rights
7. Children's Privacy
8. Changes to This Policy

Same design patterns: Instrument Serif title, "Last updated: March 2026" subtitle, table of contents, teal callout for the key section, `Metadata` export.

- [ ] **Step 2: Verify page renders at /legal/privacy**

- [ ] **Step 3: Commit**

```bash
git add app/legal/privacy/page.tsx
git commit -m "feat(legal): add Privacy Policy page (#82)"
```

### Task 5: Medical & Data Disclaimers Page

**Files:**

- Create: `app/legal/disclaimers/page.tsx`

- [ ] **Step 1: Create Disclaimers page**

Create `app/legal/disclaimers/page.tsx`.

Sections (from spec 3.4):

1. Not a Medical Device (key section — reference FDA CDS framework Section 3060)
2. No Medical Advice
3. AI Interpretation Limitations
4. Price Data Limitations
5. Professional Fees
6. Billing Code Accuracy
7. Insurance & Coverage

This page is the canonical destination for all "Full disclaimers" links throughout the app. Same design patterns (Instrument Serif title, "Last updated: March 2026" subtitle, table of contents, teal callout for key sections, `Metadata` export).

- [ ] **Step 2: Verify page renders at /legal/disclaimers**

- [ ] **Step 3: Commit**

```bash
git add app/legal/disclaimers/page.tsx
git commit -m "feat(legal): add Medical & Data Disclaimers page (#82)"
```

---

## Chunk 3: Footer & In-App Disclaimers

### Task 6: Update Footer with Legal Links

**Files:**

- Modify: `components/Footer.tsx`

- [ ] **Step 1: Add Legal column to Footer**

In `components/Footer.tsx`, the three-column grid (Brand, Navigate, About the Data) needs a "Legal" section. Two approaches:

**Option A:** Replace the three-column grid with a four-column grid (`sm:grid-cols-4`) and add a "Legal" column.
**Option B:** Add legal links to the existing "Navigate" column.

Option A is cleaner — the legal links are semantically different from navigation. Add:

```tsx
{
  /* Legal */
}
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
</div>;
```

Update the grid from `sm:grid-cols-3` to `grid-cols-2 sm:grid-cols-4`.

- [ ] **Step 2: Add "Full disclaimers" link to bottom bar**

In the bottom bar `<p>` (around line 119-125), add a link after the existing medical disclaimer text:

```tsx
<p>
  Prices shown are self-pay / cash rates and may not reflect your final cost.
  ClearCost is a price transparency tool, not a medical device. It does not
  provide medical advice, diagnosis, or treatment recommendations. Always
  consult a qualified healthcare provider for medical decisions.{" "}
  <Link
    href="/legal/disclaimers"
    className="underline hover:no-underline"
    style={{ color: "var(--cc-primary)" }}
  >
    Full disclaimers
  </Link>
</p>
```

- [ ] **Step 3: Verify footer renders correctly**

Check on homepage, guided search, and results pages. Confirm:

- Four-column grid renders properly on desktop
- Collapses to two columns on mobile (`grid-cols-2`)
- Legal links navigate to the correct pages (no 404s)
- "Full disclaimers" link is visible in the bottom bar

- [ ] **Step 4: Commit**

```bash
git add components/Footer.tsx
git commit -m "feat(footer): add legal page links and Full disclaimers link (#82)"
```

### Task 7: Guided Search Info Banner

**Files:**

- Modify: `app/guided-search/page.tsx`

- [ ] **Step 1: Add info banner inside the clarifying phase block**

In `app/guided-search/page.tsx`, inside the `phase === "clarifying"` block (line 98-143), add the info banner ABOVE the `<BreadcrumbTrail>` (before line 100):

```tsx
{
  /* Pricing tool context banner */
}
<div
  className="flex items-start gap-2 rounded-lg border px-3 py-2.5 mb-4"
  style={{
    background: "#f0fdf9",
    borderColor: "#99f6e4",
  }}
>
  <svg
    className="w-4 h-4 shrink-0 mt-0.5"
    style={{ color: "var(--cc-primary)" }}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
  <p
    className="text-[13px] leading-relaxed"
    style={{ color: "var(--cc-primary)" }}
  >
    These questions help us find the right billing code for your price search.
    This is not a medical assessment.
  </p>
</div>;
```

- [ ] **Step 2: Refine the existing disclaimer at the bottom**

In the same file, update the existing disclaimer text (lines 136-142):

Change from:

```
This tool helps you find pricing, not diagnose conditions. Always
consult a healthcare provider for medical advice.
```

To (draft — final language may be adjusted based on research findings from Task 1):

```
ClearCost is a price comparison tool, not a medical service. Always
consult a healthcare provider for medical decisions.
```

- [ ] **Step 3: Verify in browser**

Navigate to guided search with a query (e.g., `http://localhost:3000/guided-search?q=knee+MRI&lat=39.7&lng=-104.9`). Confirm:

- Info banner appears above the breadcrumbs in the clarifying phase
- Info banner does NOT appear during the loading phase
- Existing disclaimer at the bottom has updated text
- Styling matches: light teal background, teal border, info icon

- [ ] **Step 4: Commit**

```bash
git add app/guided-search/page.tsx
git commit -m "feat(guided-search): add pricing tool context banner and refine disclaimer (#82)"
```

### Task 8: Results Page Code Accuracy Note

**Files:**

- Modify: `app/results/page.tsx`

- [ ] **Step 1: Add code accuracy note in InterpretationBanner**

In `app/results/page.tsx`, inside the `InterpretationBanner` component's expanded content section, add a disclaimer note AFTER the code chips block. The code chips are rendered inside `<div className="px-3 pb-3">` (lines 321-348).

Add the note inside the `px-3 pb-3` div, after the `cptCodes.length > 0` conditional block (after line 347), but only when codes are present:

```tsx
{
  cptCodes.length > 0 && (
    <p
      className="text-xs mt-2 px-2.5 py-2 rounded-md leading-relaxed"
      style={{
        background: "var(--cc-bg)",
        color: "var(--cc-text-tertiary)",
      }}
    >
      These codes are our interpretation of your search. Your provider may bill
      differently — confirm codes and pricing before your visit.
    </p>
  );
}
```

**Exact insertion point:** The `<div className="px-3 pb-3">` container (line 321) contains an optional encounter note, then the code chips block (lines 331-347). Insert the new `<p>` between line 347 (closing `</div>` of the chips flex container) and line 348 (closing `</div>` of the `px-3 pb-3` container). The new element must be INSIDE the `px-3 pb-3` div, not after it.

- [ ] **Step 2: Verify in browser**

Navigate to results with a query that produces codes. Click the interpretation banner to expand it. Confirm:

- The accuracy note appears below the code chips
- Text is small (12px), tertiary color, subtle background
- Note does NOT appear when there are no codes
- Note disappears when the banner is collapsed

- [ ] **Step 3: Commit**

```bash
git add app/results/page.tsx
git commit -m "feat(results): add code accuracy disclaimer in interpretation banner (#82)"
```

---

## Chunk 4: Final Verification

### Task 9: Visual QA & CI Check

**Files:** None (verification only)

- [ ] **Step 1: Visual QA with gstack browse**

Test all disclaimer surfaces in the headless browser:

```bash
# Homepage — verify footer has legal links
$B goto http://localhost:3000
$B text  # Check for "Terms of Service", "Privacy Policy", "Disclaimers", "Full disclaimers"

# Guided search — verify info banner
$B goto "http://localhost:3000/guided-search?q=knee+MRI&lat=39.7392&lng=-104.9903"
$B text  # Check for "billing code for your price search"

# Results — verify code accuracy note (need to expand banner)
$B goto "http://localhost:3000/results?q=knee+MRI&codes=73721&codeType=cpt&lat=39.7392&lng=-104.9903"
# Click interpretation banner to expand
$B snapshot -i  # Find the interpretation banner button
# Click to expand, check for accuracy note text

# Legal pages
$B goto http://localhost:3000/legal/terms
$B text  # Verify Terms content
$B goto http://localhost:3000/legal/privacy
$B text  # Verify Privacy content
$B goto http://localhost:3000/legal/disclaimers
$B text  # Verify Disclaimers content
```

- [ ] **Step 2: Test footer link navigation**

Verify every link in the footer navigates to a real page (no 404s):

- /legal/terms
- /legal/privacy
- /legal/disclaimers

Verify the "Full disclaimers" link in the footer bottom bar works.

- [ ] **Step 3: Run CI checks**

```bash
npm run lint
npx tsc --noEmit
```

Do NOT run `npm run build` unless explicitly deploying — it consumes 40GB+ RAM.

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address QA issues from disclaimer implementation (#82)"
```

- [ ] **Step 5: Review all changes since branch start**

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat
```

Confirm all changes are intentional and no unrelated files were modified.
