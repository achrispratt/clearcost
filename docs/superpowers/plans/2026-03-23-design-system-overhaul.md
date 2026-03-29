# Design System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the entire ClearCost UI from the current teal/Instrument Serif "Warm Editorial" design to the new coral/Fraunces "Editorial Warmth with Edge" design system defined in DESIGN.md.

**Architecture:** The redesign leverages the existing CSS custom property architecture — 95% of colors/fonts use `--cc-*` variables, so changing `globals.css` root tokens propagates across all 32+ component files automatically. Only font loading (layout.tsx), hardcoded hex values (4-5 files), and explicit `--font-instrument-serif` references (~15 files) need per-file changes. **Task ordering: Tasks must execute sequentially — Task 2 depends on Task 1 (font variable names must match).**

**Tech Stack:** Next.js 16, Tailwind CSS v4, DaisyUI 5, next/font/google (Fraunces, Space Grotesk, IBM Plex Mono)

---

## File Structure

### Files to Modify

| File                                 | Responsibility                                      | Change Type                           |
| ------------------------------------ | --------------------------------------------------- | ------------------------------------- |
| `app/globals.css`                    | All CSS custom properties, theme bridge, animations | Token values + font variable names    |
| `app/layout.tsx`                     | Font loading via next/font/google, viewport meta    | Font imports + variable names         |
| `public/manifest.json`               | PWA theme/background colors                         | Hex values                            |
| `components/Navbar.tsx`              | Site nav, logo/wordmark                             | Font family reference                 |
| `components/Footer.tsx`              | Site footer, wordmark                               | Font family reference                 |
| `components/landing/HeroSection.tsx` | Homepage hero                                       | Font family reference + hero copy     |
| `components/landing/HowItWorks.tsx`  | How it works section                                | Font family reference + hardcoded hex |
| `components/landing/DataQuality.tsx` | Data quality section                                | Font family reference                 |
| `components/ClarificationStep.tsx`   | Guided search Q&A                                   | Font family reference                 |
| `components/CostContextBanner.tsx`   | Cost context warning                                | Hardcoded rgba values                 |
| `app/auth/signin/page.tsx`           | Sign-in page                                        | Font family reference                 |
| `app/auth/signup/page.tsx`           | Sign-up page                                        | Font family reference                 |
| `app/auth/reset-password/page.tsx`   | Password reset page                                 | Font family reference                 |
| `app/saved/page.tsx`                 | Saved searches page                                 | Font family reference                 |
| `app/legal/terms/page.tsx`           | Terms of Service                                    | Font family reference                 |
| `app/legal/privacy/page.tsx`         | Privacy Policy                                      | Font family reference                 |
| `app/legal/disclaimers/page.tsx`     | Disclaimers                                         | Font family reference                 |

### Files That Auto-Update (no manual changes needed)

All other components (ResultCard, ResultsList, FilterBar, MapView, SearchBar, LocationInput, SaveButton, AuthButton, BreadcrumbTrail, Tooltip, WhyClearCost, SearchCategories, results page, guided-search page) use `--cc-*` CSS variables exclusively and will inherit the new design automatically when globals.css tokens change.

---

## Task 1: Update CSS Design Tokens

**Files:**

- Modify: `app/globals.css:9-47` (root variables)
- Modify: `app/globals.css:42-47` (@theme inline block)
- Modify: `app/globals.css:194-206` (hero-gradient)

This is the single highest-leverage change — updating root tokens propagates to every component.

- [ ] **Step 1: Replace the `:root` color tokens**

Replace lines 9-40 in `app/globals.css`:

```css
:root {
  /* Surface & Background */
  --cc-bg: #f5f0e8;
  --cc-surface: #fffdf8;
  --cc-surface-hover: #f2ede4;
  --cc-surface-alt: #eae2d3;
  --cc-border: #d4cfc4;
  --cc-border-strong: #b8b0a2;

  /* Text */
  --cc-text: #1a1a2e;
  --cc-text-secondary: #4a4a5e;
  --cc-text-tertiary: #78716c;

  /* Primary — Coral (action, CTAs, brand) */
  --cc-primary: #ff6b4a;
  --cc-primary-hover: #e85d3e;
  --cc-primary-light: #fff0ec;
  --cc-primary-muted: #ffe4dd;
  --cc-primary-subtle: rgba(255, 107, 74, 0.08);
  --cc-primary-text: #fff;

  /* Accent — Amber (contextual warnings, gross prices) */
  --cc-accent: #d97706;
  --cc-accent-light: #fef3c7;

  /* Semantic */
  --cc-success: #059669;
  --cc-success-light: #ecfdf5;
  --cc-error: #dc2626;
  --cc-error-light: #fef2f2;
  --cc-info: #1e40af;
}
```

- [ ] **Step 2: Update the @theme inline block for font variables**

Replace lines 42-47:

```css
@theme inline {
  --color-background: var(--cc-bg);
  --color-foreground: var(--cc-text);
  --font-sans: var(--font-space-grotesk);
  --font-serif: var(--font-fraunces);
}
```

- [ ] **Step 3: Update the hero-gradient**

Replace lines 194-206 with cream/coral tones instead of teal/amber:

```css
.hero-gradient {
  background:
    radial-gradient(
      ellipse at 60% 0%,
      rgba(255, 107, 74, 0.04) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse at 20% 80%,
      rgba(217, 119, 6, 0.03) 0%,
      transparent 50%
    );
}
```

- [ ] **Step 4: Update hardcoded teal rgba in search-container:focus-within**

In `globals.css`, find the `.search-container:focus-within` rule (~line 218-223). Replace the hardcoded teal rgba:

- `rgba(15, 118, 110, 0.1)` → `rgba(255, 107, 74, 0.1)` (coral-tinted shadow)
- Also update `0 0 0 3px var(--cc-primary-subtle)` if it still references teal — it should auto-update via the token change, but verify.

- [ ] **Step 5: Update the design system comment header**

Replace lines 4-7:

```css
/* ============================================================================
   ClearCost Design System
   Aesthetic: Editorial Warmth with Edge — coral accent, paper surfaces, confident type
   ============================================================================ */
```

- [ ] **Step 6: Verify globals.css compiles**

Run: `npx tsc --noEmit`
Expected: No errors (CSS changes don't affect TypeScript, but confirms no broken imports)

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "style: update design tokens — coral accent, cream backgrounds, new font vars"
```

---

## Task 2: Update Font Loading

**Files:**

- Modify: `app/layout.tsx:2-19` (font imports and variables)

- [ ] **Step 1: Replace font imports**

Replace the Instrument_Serif and DM_Sans imports with Fraunces, Space_Grotesk, and IBM_Plex_Mono:

```tsx
import { Fraunces, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});
```

- [ ] **Step 2: Update the viewport themeColor**

Change from teal `#0F766E` to coral:

```tsx
export const viewport: Viewport = {
  themeColor: "#ff6b4a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};
```

- [ ] **Step 3: Update the className on `<body>` to include all three font variables**

Find the `<body>` tag and ensure it includes all three font CSS variable classes:

```tsx
<body className={`${fraunces.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
```

- [ ] **Step 4: Update the inline fontFamily style on `<body>`**

The `<body>` tag has a hardcoded `style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}`. This inline style wins over className in specificity. Update it to reference the new font variable:

```tsx
style={{ fontFamily: "var(--font-space-grotesk), system-ui, sans-serif" }}
```

- [ ] **Step 5: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx
git commit -m "style: load Fraunces + Space Grotesk + IBM Plex Mono fonts"
```

---

## Task 3: Update PWA Manifest

**Files:**

- Modify: `public/manifest.json`

- [ ] **Step 1: Update theme and background colors**

Change `theme_color` from `#0F766E` to `#ff6b4a` and `background_color` from `#ffffff` to `#f5f0e8`.

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "style: update PWA manifest colors for new design system"
```

---

## Task 4: Update Font Family References in Components

**Files:**

- Modify: `components/Navbar.tsx` — search for `instrument-serif`, replace with `fraunces`
- Modify: `components/Footer.tsx` — same
- Modify: `components/landing/HeroSection.tsx` — same
- Modify: `components/landing/HowItWorks.tsx` — same + hardcoded hex colors
- Modify: `components/landing/WhyClearCost.tsx` — same
- Modify: `components/landing/DataQuality.tsx` — same
- Modify: `components/ClarificationStep.tsx` — same
- Modify: `app/auth/signin/page.tsx` — same
- Modify: `app/auth/signup/page.tsx` — same
- Modify: `app/auth/reset-password/page.tsx` — same (3 occurrences)
- Modify: `app/saved/page.tsx` — same (2 occurrences)
- Modify: `app/legal/terms/page.tsx` — same
- Modify: `app/legal/privacy/page.tsx` — same
- Modify: `app/legal/disclaimers/page.tsx` — same

Every file that references `var(--font-instrument-serif)` needs to change to `var(--font-fraunces)`.

- [ ] **Step 1: Global find-and-replace `--font-instrument-serif` → `--font-fraunces`**

Search all .tsx files for `font-instrument-serif` and replace with `font-fraunces`. This is a safe mechanical replacement — both are serif display fonts used in the same contexts (hero headlines, section titles, wordmark).

- [ ] **Step 2: Global find-and-replace `--font-dm-sans` → `--font-space-grotesk`**

Search all .tsx files for `font-dm-sans` and replace with `font-space-grotesk`. Check if any files reference this (unlikely — most body text inherits from the CSS theme).

- [ ] **Step 3: Fix hardcoded hex colors in HowItWorks.tsx**

Find and update:

- `#e8f4f0` (teal-tinted map background) → `#f0ece4` (cream-tinted, matches `--cc-surface-alt`)
- `#3b82f6` (blue location dot) → keep as-is or use `var(--cc-info)` — blue is appropriate for location markers

- [ ] **Step 4: Fix hardcoded rgba in CostContextBanner.tsx**

Find `rgba(217, 119, 6, 0.15)` or similar amber-based hardcoded values and replace with `rgba(217, 119, 6, 0.2)`. Amber is still the warning/accent color so the hex base is correct. Ideally reference the token: if the codebase supports modern CSS `color-mix()`, use `color-mix(in srgb, var(--cc-accent) 20%, transparent)` — otherwise the hardcoded rgba is acceptable for now.

- [ ] **Step 5: Verify with lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Verify with type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/ app/auth/ app/saved/ app/legal/
git commit -m "style: update font family references from Instrument Serif to Fraunces"
```

---

## Task 5: Update Wordmark / Logo Treatment

**Files:**

- Modify: `components/Navbar.tsx` — wordmark styling
- Modify: `components/Footer.tsx` — wordmark styling

Per DESIGN.md: "ClearCost" wordmark — "Clear" in text color, "Cost" in accent coral. Set in Fraunces 500.

- [ ] **Step 1: Update Navbar wordmark**

Find the logo/wordmark rendering in Navbar.tsx. Update to use Fraunces (should already be done from Task 4) and ensure "Cost" portion uses `var(--cc-primary)` (coral) instead of the full text being one color. If the current wordmark includes a teal icon/square, replace or remove it.

- [ ] **Step 2: Update Footer wordmark**

Same treatment as Navbar — "Clear" in text color, "Cost" in coral.

- [ ] **Step 3: Visually verify**

Run: `npm run dev` and check localhost:3000 — verify the wordmark renders correctly in both nav and footer.

- [ ] **Step 4: Commit**

```bash
git add components/Navbar.tsx components/Footer.tsx
git commit -m "style: update wordmark — Clear in ink, Cost in coral"
```

---

## Task 6: Update Hero Section Copy (Optional but Recommended)

**Files:**

- Modify: `components/landing/HeroSection.tsx`

Per DESIGN.md, the hero should be a bold typographic question rather than a statement. Current: "Know what you'll pay before you go." Proposed: "What does a knee MRI actually cost near you?" or similar question format.

- [ ] **Step 1: Evaluate current hero copy**

Read HeroSection.tsx. If the current copy is a statement ("Know what you'll pay before you go"), consider whether to change to a question format. This is a product decision — the copy change is optional, but the font/color changes from Tasks 1-4 are mandatory.

- [ ] **Step 2: If changing copy, update the hero headline**

Change to question format with italic emphasis on the key word, per DESIGN.md preview.

- [ ] **Step 3: Commit (if changes made)**

```bash
git add components/landing/HeroSection.tsx
git commit -m "style: update hero copy to question format per DESIGN.md"
```

---

## Task 7: Visual QA and Verification

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: QA homepage**

Check: Fraunces renders for headlines, Space Grotesk for body, cream backgrounds, coral accent on CTAs/links, wordmark correct, search bar focus glow is coral.

- [ ] **Step 3: QA results page**

Search for "colonoscopy" near any location. Check: result cards use coral for prices, badges use correct accent light, map markers don't conflict with new palette, accordion expand/collapse works.

- [ ] **Step 4: QA guided search**

Start a search that triggers clarification. Check: Fraunces on question headings, coral on selection buttons, breadcrumb trail uses correct tokens.

- [ ] **Step 5: QA auth pages**

Check sign-in page: Fraunces on heading, coral CTA button, correct background color.

- [ ] **Step 6: QA mobile responsive**

Check homepage and results at 375px width. Verify touch targets, font sizes, and layout.

- [ ] **Step 7: Run full lint + type check**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Final commit if any fixes needed**

```bash
git add -A
git commit -m "style: visual QA fixes for design system overhaul"
```

---

## Execution Notes

**What's NOT in scope for this plan:**

- Dark mode implementation (DESIGN.md defines dark tokens but the app doesn't currently have a dark mode toggle)
- Price spectrum strip (new feature — should be a separate plan/PR)
- Layout restructuring (asymmetric hero, etc. — separate plan)
- These are Phase 2 items that build on the token foundation laid here

**Risk assessment:**

- LOW: Token changes in globals.css propagate automatically — this is by far the safest part
- LOW: Font swap is mechanical — same variable pattern, just different font names
- MEDIUM: Hardcoded colors in 2-3 files need manual attention
- LOW: PWA manifest is a simple hex swap

**Estimated effort:** ~30 min CC time (Tasks 1-4 are mechanical, Task 5-6 need judgment, Task 7 is verification)
