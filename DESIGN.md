# Design System — ClearCost

## Product Context

- **What this is:** Consumer healthcare price comparison tool — "Kayak for hospital prices"
- **Who it's for:** Everyday Americans trying to understand healthcare costs before a procedure
- **Space/industry:** Healthcare price transparency, consumer fintech comparison
- **Project type:** Web app (search + results + map) with marketing homepage

## Aesthetic Direction

- **Direction:** Warm Editorial
- **Decoration level:** Intentional — subtle background gradients, dot-grid texture, map as functional element. No blobs, no stock illustrations.
- **Mood:** Trustworthy, modern, distinctive. Medical authority and calm — the serif headline and teal accent say "we're serious about healthcare." Credible, not clinical.
- **Reference sites:** Kayak (data density), NerdWallet (editorial authority)
- **Anti-patterns:** No purple gradients, no 3-column icon grids with centered everything, no decorative blobs, no stock photos of smiling clinicians

## Typography

- **Display/Hero:** Instrument Serif (Google Fonts, weight 400) — classic editorial serif with warmth and authority. Use for hero headlines, section titles, wordmark, savings callouts.
- **Body/UI:** DM Sans (Google Fonts, variable 100-1000) — clean humanist sans-serif with excellent readability. Use for body text, UI labels, navigation, buttons, filters.
- **Data/Tables:** DM Sans with `font-variant-numeric: tabular-nums` — ensures price columns align.
- **Code:** System monospace — for billing codes (CPT 73721), metadata, source attributions.
- **Loading:** Google Fonts via `next/font/google` with `display: "swap"`.
- **Scale:**
  - Hero: clamp(36px, 5vw, 56px) / Instrument Serif 400
  - Section title: 32px / Instrument Serif 400
  - Subheading: 20px / DM Sans 600
  - Body: 15px / DM Sans 400
  - Small/UI: 13px / DM Sans 500
  - Caption: 11px / DM Sans 600, uppercase, letter-spacing 0.06-0.1em
  - Data large: 28px / DM Sans 700
  - Data inline: 16px / DM Sans 700

## Color

- **Approach:** Restrained — teal primary is the dominant brand color, amber is rare and meaningful (warnings, savings attention)
- **Rationale:** Teal signals health, trust, and calm. Amber draws attention to cost-related callouts without alarm.

### Light Mode

| Role           | Token                 | Hex                        | Usage                                                  |
| -------------- | --------------------- | -------------------------- | ------------------------------------------------------ |
| Background     | `--cc-bg`             | `#fafaf8`                  | Page background — clean near-white                     |
| Surface        | `--cc-surface`        | `#ffffff`                  | Cards, panels, inputs                                  |
| Surface hover  | `--cc-surface-hover`  | `#f7f7f5`                  | Hover states on surfaces                               |
| Surface alt    | `--cc-surface-alt`    | `#f5f3ef`                  | Secondary surfaces, badges, pill groups                |
| Border         | `--cc-border`         | `#e8e5df`                  | Default borders                                        |
| Border strong  | `--cc-border-strong`  | `#d4d0c8`                  | Emphasized borders, section rules                      |
| Text           | `--cc-text`           | `#1a1a2e`                  | Primary text — deep ink with blue undertone            |
| Text secondary | `--cc-text-secondary` | `#5c5c6f`                  | Supporting text, descriptions                          |
| Text tertiary  | `--cc-text-tertiary`  | `#9b9ba8`                  | Muted text, metadata, captions                         |
| Primary (Teal) | `--cc-primary`        | `#0f766e`                  | CTAs, links, active states, brand color                |
| Primary hover  | `--cc-primary-hover`  | `#0d9488`                  | Hover state for primary                                |
| Primary light  | `--cc-primary-light`  | `#f0fdfa`                  | Primary backgrounds, badges                            |
| Primary muted  | `--cc-primary-muted`  | `#ccfbf1`                  | Selection highlight, soft tints                        |
| Primary subtle | `--cc-primary-subtle` | `rgba(15, 118, 110, 0.08)` | Focus rings, hover tints                               |
| Accent (Amber) | `--cc-accent`         | `#d97706`                  | Contextual warnings, "facility fee only", gross prices |
| Accent light   | `--cc-accent-light`   | `#fef3c7`                  | Warning backgrounds                                    |
| Success        | `--cc-success`        | `#059669`                  | Savings, lowest price, Medicare                        |
| Success light  | `--cc-success-light`  | `#ecfdf5`                  | Success backgrounds                                    |
| Error          | `--cc-error`          | `#dc2626`                  | Errors                                                 |
| Error light    | `--cc-error-light`    | `#fef2f2`                  | Error backgrounds                                      |
| Info           | `--cc-info`           | `#1e40af`                  | Insured/negotiated rate data                           |

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — data-dense in results, spacious on landing
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Component gaps:** 8px (1.5) between result cards, 24px between sections, 32px between major areas

## Layout

- **Approach:** Centered editorial — centered hero content, split results view
- **Grid:** Single column with max-width constraint. Results page uses 2-column split (list + map).
- **Max content width:** 1120px (max-w-5xl)
- **Border radius:** Hierarchical — sm:4px (badges, code pills), md:8px (cards, buttons, inputs), lg:12px (panels, map, search bar), xl:16px (hero search container)
- **Key principles:**
  - Hero is centered with generous vertical padding
  - Results use left-aligned list + persistent right map pane on desktop
  - Data density over whitespace in results — price, distance, facility in one scan line
  - Map is a tool, not decoration — persistent right pane on desktop

## Motion

- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(cubic-bezier(0.16, 1, 0.3, 1))
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **Accordion:** CSS Grid `grid-template-rows: 0fr → 1fr` with 250ms ease-out
- **Scroll reveal:** `opacity 0→1, translateY 20→0px` with 600ms spring easing. Must respect `prefers-reduced-motion`.
- **Hover:** `translateY(-2px)` lift on cards, 200ms ease
- **Focus:** `box-shadow: 0 0 0 3px var(--cc-primary-subtle)` — teal focus ring

## Brand Identity

- **Wordmark:** "ClearCost" with teal plus-sign icon mark. Set in Instrument Serif.
- **Voice:** Direct, trustworthy, accessible. Healthcare pricing made plain. No corporate hedging, no clinical jargon.

## Decisions Log

| Date       | Decision                  | Rationale                                                                                                                                                                                                                             |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-23 | Design system documented  | Codified existing Warm Editorial design into DESIGN.md as source of truth.                                                                                                                                                            |
| 2026-03-23 | Explored coral redesign   | Full consultation with competitive research + Codex + Claude subagent. Coral accent, cream backgrounds, Fraunces + Space Grotesk fonts. All three voices converged on dropping teal.                                                  |
| 2026-03-24 | Reverted to original teal | After seeing the coral/cream design live, it read "autumnal" — too warm/earthy for a healthcare tool. The original teal + white is cleaner, more professional, and already proven. Keeping original Instrument Serif + DM Sans fonts. |
