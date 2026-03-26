# Results UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered accordion-card results layout with a clean table-style split view, integrate search into the nav bar, and show Est. Total as the primary price.

**Architecture:** The overhaul rewrites 3 components (ResultCard → ResultRow, Navbar, results page layout) and adjusts 2 others (FilterBar, SearchBar). The data layer (types, API, hooks) is unchanged — this is purely a presentation overhaul. The key structural change is moving from flex-based accordion cards to a grid-based table layout with progressive disclosure. **Task ordering: Tasks 1-4 are independent. Task 5 depends on Task 4. Task 6 depends on Task 5. Task 7 depends on Task 6.** For the navbar search integration, the approach is a React Context provider pattern — results page writes search state into context, Navbar reads from it.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, existing CSS variables from globals.css

**Reference:** HTML prototype at `/tmp/clearcost-results-prototype.html`, GitHub issue #142

---

## File Structure

### Files to Create

| File                             | Responsibility                                                       |
| -------------------------------- | -------------------------------------------------------------------- |
| `components/ResultRow.tsx`       | New table-row result component (replaces ResultCard in results view) |
| `components/ResultRowDetail.tsx` | Expanded detail panel (fee breakdown, Medicare, profile link)        |

### Files to Modify

| File                         | Change                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| `components/Navbar.tsx`      | Add search bar + interpretation inline                                  |
| `components/ResultsList.tsx` | Switch from cards to table rows, add column headers                     |
| `components/FilterBar.tsx`   | Compact the layout (smaller selects, tighter spacing)                   |
| `components/SearchBar.tsx`   | Add `inline` variant for navbar integration                             |
| `app/results/page.tsx`       | Change split to 50/50, move search to nav, remove interpretation banner |

### Files to Keep (no changes)

| File                                 | Why                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `components/ResultCard.tsx`          | Keep for now — still used in mobile and potentially other views. Don't delete. |
| `components/MapView.tsx`             | Map works as-is, just needs more space (handled by page layout change)         |
| `types/index.ts`                     | Data types are unchanged                                                       |
| `lib/cpt/*`, `lib/kb/*`, `app/api/*` | Backend is unchanged                                                           |

---

## Task 1: Create ResultRow Component (Collapsed State)

**Files:**

- Create: `components/ResultRow.tsx`

The new table-row component replaces ResultCard's collapsed state. Grid-based, scannable, with Est. Total as the primary highlighted price.

- [ ] **Step 1: Create ResultRow with grid layout**

```tsx
// components/ResultRow.tsx
"use client";

import {
  formatPrice,
  formatDistance,
  getDisplayPrice,
  displayName,
} from "@/lib/format";
import type { ChargeResult } from "@/types";

interface ResultRowProps {
  result: ChargeResult;
  rank: number;
  isSelected?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect?: () => void;
}

export function ResultRow({
  result,
  rank,
  isSelected,
  isExpanded,
  onToggleExpand,
  onSelect,
}: ResultRowProps) {
  const distance = formatDistance(result.distanceMiles);
  const displayPrice = getDisplayPrice(result);
  const estTotal =
    result.estimatedTotalMedian ?? result.episodeEstimate?.estimatedAllInMedian;

  return (
    <div
      data-result-id={result.id}
      data-provider-id={result.provider.id}
      className="grid items-center cursor-pointer select-none transition-colors duration-100"
      style={{
        gridTemplateColumns: "1fr 90px 90px 65px 80px 24px",
        padding: "10px 16px",
        borderBottom: isExpanded ? "none" : "1px solid var(--cc-border)",
        background: isExpanded
          ? "var(--cc-primary-light)"
          : isSelected
            ? "var(--cc-primary-light)"
            : "transparent",
      }}
      role="button"
      aria-expanded={isExpanded}
      onClick={() => {
        onToggleExpand?.();
        if (!isExpanded) onSelect?.();
      }}
      onMouseEnter={(e) => {
        if (!isExpanded && !isSelected)
          (e.currentTarget as HTMLElement).style.background =
            "var(--cc-surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isExpanded && !isSelected)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Provider */}
      <div>
        <div
          className="font-semibold text-[13px] truncate"
          style={{ color: "var(--cc-text)" }}
        >
          {displayName(result.provider.name)}
        </div>
        <div
          className="text-[11px]"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          {result.setting || "Outpatient"}
        </div>
      </div>

      {/* Est. Total — primary number */}
      <div
        className="font-bold text-[15px]"
        style={{ color: "var(--cc-primary)" }}
      >
        {estTotal ? formatPrice(estTotal) : formatPrice(displayPrice.amount)}
      </div>

      {/* Base Price — secondary */}
      <div
        className="text-[13px]"
        style={{ color: "var(--cc-text-secondary)" }}
      >
        {formatPrice(displayPrice.amount)}
      </div>

      {/* Distance */}
      <div className="text-[12px]" style={{ color: "var(--cc-text-tertiary)" }}>
        {distance}
      </div>

      {/* Quality stars — placeholder until #141 */}
      <div className="text-[12px]" style={{ color: "var(--cc-text-tertiary)" }}>
        —
      </div>

      {/* Chevron */}
      <svg
        className="w-3.5 h-3.5 transition-transform duration-150"
        style={{
          color: isExpanded ? "var(--cc-primary)" : "var(--cc-border-strong)",
          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
        }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/ResultRow.tsx
git commit -m "feat: add ResultRow table-style component for results overhaul"
```

---

## Task 2: Create ResultRowDetail Component (Expanded State)

**Files:**

- Create: `components/ResultRowDetail.tsx`

The expanded detail panel — fee breakdown, Medicare comparison, avg insured, and hospital profile link. Two-column layout (breakdown left, meta right).

- [ ] **Step 1: Create ResultRowDetail**

```tsx
// components/ResultRowDetail.tsx
"use client";

import { formatPrice, getDisplayPrice } from "@/lib/format";
import type { ChargeResult } from "@/types";

interface ResultRowDetailProps {
  result: ChargeResult;
}

const notNull = (v: string | undefined): v is string =>
  !!v && v.toLowerCase() !== "null";

export function ResultRowDetail({ result }: ResultRowDetailProps) {
  const displayPrice = getDisplayPrice(result);
  const estTotal =
    result.estimatedTotalMedian ?? result.episodeEstimate?.estimatedAllInMedian;

  const address = [
    result.provider.address,
    result.provider.city,
    [result.provider.state, result.provider.zip].filter(notNull).join(" "),
  ]
    .filter(notNull)
    .join(", ");

  const billingClassNote =
    result.billingClass?.toLowerCase() === "facility"
      ? "Facility fee only — professional fees may apply separately"
      : result.billingClass?.toLowerCase() === "professional"
        ? "Professional fee only — facility charges may apply separately"
        : null;

  return (
    <div
      style={{
        background: "var(--cc-primary-light)",
        borderBottom: "1px solid var(--cc-border)",
      }}
    >
      <div style={{ padding: "12px 16px" }} className="flex gap-4">
        {/* Left — fee breakdown */}
        <div className="flex-1 min-w-0">
          {address && (
            <p
              className="text-[12px] mb-2.5"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              {address}
            </p>
          )}

          <div
            className="rounded-md p-3"
            style={{
              background: "var(--cc-surface)",
              border: "1px solid var(--cc-border)",
            }}
          >
            <p
              className="text-[10px] font-bold uppercase tracking-wider mb-2"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              Fee Breakdown
            </p>
            <div className="flex justify-between py-1 text-[13px]">
              <span style={{ color: "var(--cc-text-secondary)" }}>
                {result.billingClass?.toLowerCase() === "professional"
                  ? "Professional Fee"
                  : "Facility Fee"}
              </span>
              <span
                className="font-semibold"
                style={{ color: "var(--cc-text)" }}
              >
                {formatPrice(displayPrice.amount)}
              </span>
            </div>
            {billingClassNote && (
              <div className="flex justify-between py-1 text-[13px]">
                <span style={{ color: "var(--cc-text-secondary)" }}>
                  {result.billingClass?.toLowerCase() === "facility"
                    ? "Professional Fee"
                    : "Facility Fee"}
                </span>
                <span
                  className="text-[12px] italic"
                  style={{ color: "var(--cc-accent)" }}
                >
                  Billed separately
                </span>
              </div>
            )}
            {estTotal && estTotal !== displayPrice.amount && (
              <div
                className="flex justify-between py-1.5 mt-1 text-[13px]"
                style={{ borderTop: "1px solid var(--cc-border)" }}
              >
                <span
                  className="font-semibold"
                  style={{ color: "var(--cc-text)" }}
                >
                  Estimated Total
                </span>
                <span
                  className="font-bold text-[15px]"
                  style={{ color: "var(--cc-primary)" }}
                >
                  {formatPrice(estTotal)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right — meta + CTA */}
        <div
          className="flex flex-col gap-2 justify-between"
          style={{ minWidth: 170 }}
        >
          {result.medicareFacilityRate != null && (
            <div className="text-[12px]">
              <span style={{ color: "var(--cc-text-tertiary)" }}>
                Medicare:{" "}
              </span>
              <span
                className="font-semibold"
                style={{ color: "var(--cc-success)" }}
              >
                {formatPrice(result.medicareFacilityRate)}
              </span>
              {result.medicareMultiplier != null &&
                result.medicareMultiplier > 1 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1"
                    style={{
                      background: "var(--cc-accent-light)",
                      color: "var(--cc-accent)",
                    }}
                  >
                    {result.medicareMultiplier}×
                  </span>
                )}
            </div>
          )}
          {result.avgNegotiatedRate != null && (
            <div className="text-[12px]">
              <span style={{ color: "var(--cc-text-tertiary)" }}>
                Avg Insured:{" "}
              </span>
              <span
                className="font-semibold"
                style={{ color: "var(--cc-info)" }}
              >
                {formatPrice(result.avgNegotiatedRate)}
              </span>
              {result.payerCount != null && result.payerCount > 0 && (
                <span style={{ color: "var(--cc-text-tertiary)" }}>
                  {" "}
                  ({result.payerCount} payers)
                </span>
              )}
            </div>
          )}
          <button
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md transition-colors mt-auto"
            style={{
              background: "var(--cc-surface)",
              border: "1px solid var(--cc-primary)",
              color: "var(--cc-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            View Hospital Profile →
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/ResultRowDetail.tsx
git commit -m "feat: add ResultRowDetail fee breakdown component"
```

---

## Task 3: Update ResultsList to Use Table Layout

**Files:**

- Modify: `components/ResultsList.tsx`

Replace card-based rendering with column headers + ResultRow + ResultRowDetail.

- [ ] **Step 1: Update imports and add column headers**

Replace the `ResultCard` import with `ResultRow` and `ResultRowDetail`. Add a column headers row above the results. Keep all existing state logic (expandedIds, marker click effects) — just change what renders.

Key changes:

- Import `ResultRow` and `ResultRowDetail` instead of `ResultCard`
- Add a sticky column header row matching the grid: Provider | Est. Total | Base Price | Distance | Quality
- Replace `<ResultCard>` rendering with `<ResultRow>` + conditional `<ResultRowDetail>`
- Thread `codeDescriptionMap` prop through to `ResultRowDetail` (currently passed to ResultCard for billing code description display — intentionally dropped from ResultRow collapsed state but keep available in expanded detail if needed later)
- Remove `animate-fade-up` staggered animation (table rows shouldn't slide in individually)
- Update loading skeleton to match table-row proportions

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/ResultsList.tsx
git commit -m "feat: switch ResultsList from cards to table rows with column headers"
```

---

## Task 4: Add Inline Search Variant to SearchBar

**Files:**

- Modify: `components/SearchBar.tsx`

Add an `inline` variant that renders as a single tight row suitable for the navbar — no wrapping, no shadow, minimal padding. Reuses existing state/validation logic.

- [ ] **Step 1: Add `inline` to the props and render a compact row variant**

When `inline` is true:

- No border-radius wrapper, no shadow
- Query input + location input + button in a tight flex row
- Smaller padding (py-1.5 px-2), smaller font (text-[13px])
- Location input narrower (w-36)
- Button: small pill (px-3 py-1.5 text-[13px])
- No placeholders rotation — just static placeholder text

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/SearchBar.tsx
git commit -m "feat: add inline search bar variant for navbar integration"
```

---

## Task 5: Integrate Search + Interpretation into Navbar

**Files:**

- Modify: `components/Navbar.tsx`
- Modify: `app/results/page.tsx`

The Navbar needs to accept optional search props and render the inline SearchBar + interpretation text when on the results page.

- [ ] **Step 1: Add optional search props to Navbar**

```tsx
interface NavbarProps {
  searchBar?: React.ReactNode;
  interpretation?: React.ReactNode;
}
```

When `searchBar` is provided, render it between the logo and the nav links. When `interpretation` is provided, render it as inline text (truncated, small font) after the search bar.

- [ ] **Step 2: Create NavbarContext for search slot injection**

Create `components/NavbarContext.tsx`:

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

interface NavbarContextValue {
  searchSlot: ReactNode | null;
  setSearchSlot: (node: ReactNode | null) => void;
}

const NavbarContext = createContext<NavbarContextValue>({
  searchSlot: null,
  setSearchSlot: () => {},
});

export function NavbarProvider({ children }: { children: ReactNode }) {
  const [searchSlot, setSearchSlot] = useState<ReactNode | null>(null);
  return (
    <NavbarContext.Provider value={{ searchSlot, setSearchSlot }}>
      {children}
    </NavbarContext.Provider>
  );
}

export const useNavbarSlot = () => useContext(NavbarContext);
```

Add `NavbarProvider` to the `Providers` wrapper in `components/Providers.tsx`. In `Navbar.tsx`, call `useNavbarSlot()` and render `searchSlot` between logo and nav links when present. In the results page, call `setSearchSlot()` via useEffect to inject the inline search bar + interpretation.

- [ ] **Step 3: Update results page to inject search into navbar**

In `app/results/page.tsx`:

- Remove the standalone `<SearchBar compact>` from the page body
- Remove the `<InterpretationBanner>` component
- Add a `useEffect` that calls `setSearchSlot(<InlineSearch ... />)` on mount and `setSearchSlot(null)` on unmount
- The inline search component renders the SearchBar (inline variant) + interpretation text

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/NavbarContext.tsx components/Navbar.tsx components/Providers.tsx app/results/page.tsx
git commit -m "feat: integrate search bar and interpretation into navbar on results page"
```

---

## Task 6: Update Results Page Layout (50/50 Split)

**Depends on:** Task 5 (both modify `app/results/page.tsx` — execute sequentially)

**Files:**

- Modify: `app/results/page.tsx`

Change the split from 55/45 to 50/50. Remove dead space — search bar is in nav, interpretation is in nav, so the page body starts directly with filters → results+map.

- [ ] **Step 1: Update the split layout**

Changes:

- Remove `<SearchBar>` from page body (moved to nav in Task 5)
- Remove `<InterpretationBanner>` (moved to nav in Task 5)
- Change `lg:w-[55%]` → `lg:w-1/2` and `lg:w-[45%]` → `lg:w-1/2`
- Reduce top padding — filters should start near the top
- Update `maxHeight` calc to account for thinner nav (no search bar row below)
- Keep the `CostContextBanner` — but consider making it dismissible (it currently takes space)

- [ ] **Step 2: Compact the FilterBar**

In `components/FilterBar.tsx`:

- Reduce select padding (height 28px instead of 32px)
- Tighter gap (gap-2 instead of gap-3)
- Smaller font (text-[12px])
- Remove labels like "Within" and "Sort" — use placeholders inside selects instead

- [ ] **Step 3: Verify full flow**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 4: Visual QA**

Run: `npm run dev` and verify:

- Search bar renders in nav on results page
- Interpretation shows inline after search
- Filters are one compact row
- Results table has column headers
- Clicking a row expands fee breakdown
- Map takes 50% of screen width
- Map markers still work (click, hover, selection highlight)

- [ ] **Step 5: Commit**

```bash
git add app/results/page.tsx components/FilterBar.tsx
git commit -m "feat: 50/50 split layout, compact filters, remove dead space"
```

---

## Task 7: Mobile Responsive Adjustments

**Files:**

- Modify: `components/ResultRow.tsx`
- Modify: `components/ResultRowDetail.tsx`
- Modify: `components/ResultsList.tsx`
- Modify: `app/results/page.tsx`

Mobile needs different treatment — table columns don't work at 375px.

- [ ] **Step 1: Mobile ResultRow**

On mobile (< lg breakpoint):

- Hide Est. Total and Quality columns (show only Provider, Base Price, Distance, Chevron)
- Grid changes to `1fr 80px 60px 24px`
- Provider name can use more space
- Interpretation in nav collapses to just the code pill (CPT 71046) on mobile, full text on desktop

- [ ] **Step 2: Mobile layout**

On mobile:

- Results and map are toggled (existing pill toggle behavior — keep it)
- Filter row scrolls horizontally if needed
- Expanded detail stacks vertically (flex-col instead of flex-row)

- [ ] **Step 3: Test at 375px**

Use browser devtools to verify layout at 375px width.

- [ ] **Step 4: Commit**

```bash
git add components/ResultRow.tsx components/ResultRowDetail.tsx components/ResultsList.tsx app/results/page.tsx
git commit -m "feat: mobile responsive adjustments for table layout"
```

---

## Execution Notes

**What's NOT in scope:**

- Quality stars column data (#141 — separate issue, shows "—" placeholder for now)
- Hospital Profile page (separate feature — button is a placeholder)
- Provider Comparison view (separate feature)
- Deleting ResultCard.tsx (keep it — may still be used elsewhere or as fallback)

**Risk assessment:**

- MEDIUM: Navbar search integration — the portal/slot pattern needs careful implementation since Navbar is in layout.tsx but search state lives in the results page
- LOW: ResultRow/ResultRowDetail — straightforward new components
- LOW: Layout change (50/50) — CSS only
- MEDIUM: Mobile responsive — need to test thoroughly since we're changing from cards to table rows

**Estimated effort:** ~45 min CC time
