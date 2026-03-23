# HowItWorks Section Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the symmetric 3-column "How It Works" section with an asymmetric layout featuring inline UI previews of the actual app experience.

**Architecture:** Single file rewrite of `components/landing/HowItWorks.tsx`. No new components, dependencies, or API changes. Reuses existing `AnimateOnScroll` wrapper. All styling via Tailwind classes and existing `--cc-*` CSS custom properties.

**Tech Stack:** React 19, Tailwind CSS v4, existing design tokens

**Spec:** `docs/superpowers/specs/2026-03-22-how-it-works-redesign.md`

**Mockup:** `.superpowers/brainstorm/29176-1774189645/how-it-works-v5.html`

---

### Task 1: Scaffold the new layout structure

**Files:**

- Modify: `components/landing/HowItWorks.tsx` (full rewrite)

- [ ] **Step 1: Replace the component with the new outer structure**

Replace the entire `HowItWorks` component. New structure:

- Section wrapper: same `id`, `aria-label`, border-top, padding, background
- Container: widen from `max-w-4xl` to `max-w-5xl`
- AnimateOnScroll on section header (unchanged)
- Step 1 block (full width, flex row on `sm:`, stacks on mobile)
- Horizontal divider (`border-b`)
- Steps 2+3 block (flex row on `sm:`, stacks on mobile, vertical divider between)

Each step's text block uses the existing pattern: serif step number + heading + description + pill tags. No icons-in-circles.

Step number style: `text-3xl font-light` with `--font-instrument-serif`, followed by a short horizontal line (`h-px w-10 bg-[var(--cc-border)]`).

```tsx
import { AnimateOnScroll } from "./AnimateOnScroll";

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

        {/* Step 1: Featured full-width */}
        {/* TODO: Task 2 fills this in */}
        <div
          className="sm:flex gap-10 mb-12 pb-12"
          style={{ borderBottom: "1px solid var(--cc-border)" }}
        >
          <div className="sm:w-[280px] sm:flex-shrink-0 mb-8 sm:mb-0">
            {/* Step 1 text — Task 2 */}
          </div>
          <div className="flex-1">{/* Step 1 flow panels — Task 3 */}</div>
        </div>

        {/* Steps 2 + 3: Side by side */}
        <div className="sm:flex gap-12">
          <div className="flex-1 mb-12 sm:mb-0">{/* Step 2 — Task 4 */}</div>
          <div
            className="hidden sm:block w-px flex-shrink-0"
            style={{ background: "var(--cc-border)" }}
          />
          <div className="flex-1">{/* Step 3 — Task 5 */}</div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify it renders without errors**

Run: `npm run dev` — check homepage loads, section appears (empty but structured).

- [ ] **Step 3: Commit scaffold**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "refactor: scaffold new HowItWorks asymmetric layout (#133)"
```

---

### Task 2: Step 1 — text block and pill tags

**Files:**

- Modify: `components/landing/HowItWorks.tsx`

- [ ] **Step 1: Add Step 1 text content**

Fill in the left column of Step 1 with:

- Step number: `01` in serif font + horizontal line
- Heading: "Search in plain English" (text-xl font-semibold)
- Description: "Describe what you need. Our AI asks smart follow-up questions to find the exact right billing codes."
- Pill tags: "AI-powered", "1,000+ procedures"

Pill style: `text-[10px] font-medium rounded-full px-2.5 py-1` with `--cc-primary-light` bg and `--cc-primary` text.

Wrap in `<AnimateOnScroll>`.

- [ ] **Step 2: Verify rendering**

Check homepage — Step 1 text block visible with correct typography and pills.

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat: add Step 1 text block with pill tags (#133)"
```

---

### Task 3: Step 1 — diagnostic flow panels

**Files:**

- Modify: `components/landing/HowItWorks.tsx`

- [ ] **Step 1: Build the three flow panels**

Three panels side-by-side on desktop, stacked on mobile. Connected by `→` arrows (desktop) or `↓` (mobile). All panels are **purely decorative** — not interactive.

Use an `<ol>` wrapper for semantic structure (screen readers announce "list of 3 steps"). Each panel is an `<li>`.

Wrap the entire `<ol>` in a container with `pointer-events-none select-none` to prevent click/select confusion.

**Panel 1 — "You search":** Label + search bar mockup showing "knee MRI" with location "Trenton, NJ". Search icon (inline SVG, `aria-hidden="true"`) + location pin icon (`aria-hidden="true"`). Add `role="img" aria-label="Search bar showing 'knee MRI' near Trenton, NJ"` on the panel `<li>`.

**Panel 2 — "We clarify":** Label + serif question "Do you need contrast?" + help text + 3 radio options. "Without" is selected (teal border + filled dot). "With contrast" and "Not sure" are unselected. All radio dots are `aria-hidden="true"` (decorative). Add `role="img" aria-label="Clarification question: Do you need contrast dye?"` on the panel `<li>`.

**Panel 3 — "You choose":** Label + serif question "Which knee?" + 2 radio options ("Left knee" selected, "Right knee" unselected). Below: resolved code badge with green background showing "73721 MRI knee w/o". Add `role="img" aria-label="Question resolved to CPT code 73721, MRI knee without contrast"` on the panel `<li>`.

Each panel: `bg-[var(--cc-surface)] border border-[var(--cc-border)] rounded-[10px] p-3`. Flex-1 on desktop. **No shadow** (other landing sections don't use shadows).

Radio button style: 12px circle, 2px border `--cc-border-strong` when unselected, `--cc-primary` when selected with 6px filled inner dot.

Arrow style: `text-sm flex-shrink-0 pt-10` with `--cc-border-strong` color. Show `→` on `sm:`, `↓` below `sm:`. Arrows are `aria-hidden="true"`.

Wrap entire panel group in `<AnimateOnScroll delay={0.1}>`.

- [ ] **Step 2: Verify desktop and mobile**

Check homepage at full width (3 panels side by side with arrows) and narrow viewport (stacked with down arrows).

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat: add diagnostic flow panels to Step 1 (#133)"
```

---

### Task 4: Step 2 — mini ResultCards

**Files:**

- Modify: `components/landing/HowItWorks.tsx`

- [ ] **Step 1: Build Step 2 content**

Step number + heading + description (same pattern as Step 1 but smaller: text-base heading).

Then 3 mini ResultCards using canonical mock data. Wrap the cards container in `pointer-events-none select-none` (decorative). All chevron SVGs are `aria-hidden="true"`.

**Card 1 (expanded):** Rank badge (1, teal bg), "Regional Medical Ctr", $420 (green), 3.2 mi, up-chevron. Expanded detail: address "123 Main St, Trenton, NJ", CPT badge "CPT 73721", description "MRI knee w/o contrast", large price $420 with "Cash price" label. Footer: Medicare $196 (green, `--cc-success`), "2.1×" badge, Avg insured $312 (blue, `--cc-info`).

**Card 2 (collapsed):** Rank 2, "St. Mary's", $680, 5.1 mi, down-chevron.

**Card 3 (collapsed):** Rank 3, "Princeton Healthcare", $510, 7.8 mi, down-chevron.

Card style: `bg-[var(--cc-surface)] border border-[var(--cc-border)] rounded-lg`. Rank badge: 18px square, rounded-md, font-size 10px.

Pill tags below: "Cash prices", "Medicare comparison".

Wrap in `<AnimateOnScroll>`.

- [ ] **Step 2: Verify rendering**

Check Step 2 shows 3 result cards with first expanded.

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat: add mini ResultCards to Step 2 (#133)"
```

---

### Task 5: Step 3 — split view (list + map)

**Files:**

- Modify: `components/landing/HowItWorks.tsx`

- [ ] **Step 1: Build Step 3 content**

Step number + heading + description.

Then the split view container: `border border-[var(--cc-border)] rounded-[10px] overflow-hidden bg-[var(--cc-surface)] h-[200px] sm:flex pointer-events-none select-none` (decorative). Add `role="img" aria-label="Split view showing search results list alongside a map with price markers"` on the container.

**Left (55%):** Filter pills row (8px text: "25 mi", "Price ↑"). Then 5 result rows using canonical mock data. Row 1 highlighted with teal border and `--cc-primary-light` bg. Each row: rank number + provider name (truncated) + price. University Health shows amber price.

**Right (45%):** Map area with `--cc-primary-light` tinted background. SVG road grid (low opacity lines). 5 price pins positioned absolutely — green (`--cc-primary`) for cash, amber (`--cc-accent`) for list price. Each pin: rounded pill with white text + CSS triangle pointer below. Blue dot for user location (12px, `#3b82f6` with white border and blue shadow ring).

On mobile (below `sm:`): stack list above map, map gets fixed `h-[200px]`.

Pill tags below: "Map + List", "Filter by distance", "5,400+ hospitals".

Wrap in `<AnimateOnScroll delay={0.1}>`.

- [ ] **Step 2: Verify desktop and mobile**

Check split view shows list + map side by side on desktop, stacked on mobile.

- [ ] **Step 3: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat: add split view list+map to Step 3 (#133)"
```

---

### Task 6: Final polish and verify

**Files:**

- Modify: `components/landing/HowItWorks.tsx` (if needed)

- [ ] **Step 1: Visual review at desktop width**

Run dev server, check full layout: Step 1 featured with flow panels, horizontal divider, Steps 2+3 side by side with vertical divider.

- [ ] **Step 2: Visual review at mobile width**

Resize to 375px. Verify: everything stacks, arrows switch to `↓`, vertical divider hidden, split view stacks.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all existing tests pass (no test changes needed — this is a visual-only change).

- [ ] **Step 5: Final commit if any polish was needed**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "style: polish HowItWorks responsive layout (#133)"
```

Only commit if changes were made in polish step. Skip if Tasks 1-5 were clean.
