# How It Works Section Redesign

**Issue:** [#133](https://github.com/achrispratt/clearcost/issues/133)
**Date:** 2026-03-22
**Status:** Approved design

## Problem

The current HowItWorks section uses a symmetric 3-column grid (icon + title + description × 3) — the most recognizable AI-generated layout pattern. Flagged in design audit as FINDING-005.

## Design

### Layout: Asymmetric staggered (B-hybrid)

**Step 01 — Search in plain English** (featured, full width)
- Left half: constrained text block (280px) with step number (serif `01`), heading, description, and contextual pill tags ("AI-powered", "1,000+ procedures")
- Right half: 3 small panels side-by-side showing one sequential diagnostic flow, connected by `→` arrows:
  1. **"You search"** — search bar mockup with "knee MRI" + "Trenton, NJ"
  2. **"We clarify"** — first diagnostic question ("Do you need contrast?") with radio options, "Without" selected
  3. **"You choose"** — second question ("Which knee?") with "Left knee" selected + resolved code badge (CPT 73721)
- Separated from Steps 02/03 by a horizontal divider

**Step 02 — Compare real prices** (half width, left)
- Step number, heading, description
- Mini ResultCards matching the actual `ResultCard` component UI:
  - First card expanded: rank badge, provider name, price ($420 green), distance, address, CPT badge, Medicare comparison ($196, 2.1×), avg insured ($312)
  - Two more collapsed: rank, name, price, distance, chevron. Third shows amber "List Price" badge ($1,200)
- Pill tags: "Cash prices", "Medicare comparison"

**Step 03 — Find nearby providers** (half width, right)
- Step number, heading, description
- 55/45 split view matching the actual results page layout:
  - Left (55%): filter pills (distance, sort, settings) + scrollable result rows (5 results, first highlighted with teal border)
  - Right (45%): map with price-labeled pins (green for cash, amber for list price), triangle pointer beneath each, blue dot for user location, faint road grid background
- Pill tags: "Map + List", "Filter by distance", "5,400+ hospitals"
- Steps 02 and 03 separated by a subtle vertical divider

### Visual principles

- **No card borders on the steps themselves** — structure comes from typography hierarchy (serif step numbers), horizontal/vertical dividers, and spacing
- **Step 1 gets visual dominance** — full width, larger heading, the featured "hero" of the section
- **Inline UI previews** — each step shows a miniature version of the actual app UI (diagnostic flow, ResultCards, split view), not abstract icons or illustrations
- **Contextual pill tags** — small rounded pills beneath each step crystallize capabilities
- **Arrows between flow panels** — `→` characters connect the 3 diagnostic panels in Step 1 to show sequential progression

### Design tokens (existing)

All colors use existing CSS custom properties:
- Primary: `--cc-primary` (#0f766e), `--cc-primary-light` (#f0fdfa)
- Accent/warning: `--cc-accent` (#d97706), `--cc-accent-light` (#fef3c7)
- Text hierarchy: `--cc-text`, `--cc-text-secondary`, `--cc-text-tertiary`
- Borders: `--cc-border`, `--cc-border-strong`
- Surfaces: `--cc-surface`, `--cc-surface-alt`, `--cc-bg`
- Font: `--font-instrument-serif` for step numbers

### Mobile behavior

- Step 1: stack text above the 3 flow panels; panels stack vertically with `↓` arrows
- Steps 2 and 3: stack vertically (full width each), divider becomes horizontal
- Split view in Step 3: stack list above map, or show mobile toggle (matching actual results page behavior)

### Animation

- Retain existing `AnimateOnScroll` wrapper with staggered delays
- Flow panels in Step 1 could animate sequentially (0.1s stagger) to reinforce the left-to-right progression

## What this replaces

| Removed | Added |
|---------|-------|
| Symmetric 3-column grid | Asymmetric: full-width Step 1 + half-width Steps 2/3 |
| Icon-in-circle pattern | Inline UI previews (diagnostic flow, ResultCards, split view) |
| Generic 2-line descriptions | Contextual pill tags + actual app UI mockups |
| Identical visual weight per step | Step 1 featured with visual dominance |

## Scope

- Single file change: `components/landing/HowItWorks.tsx`
- No new dependencies
- No API changes
- No new components needed (reuses `AnimateOnScroll`)

## Mockups

Visual mockups in `.superpowers/brainstorm/29176-1774189645/how-it-works-v5.html`
