# Design System — ClearCost

## Product Context

- **What this is:** Consumer healthcare price comparison tool — "Kayak for hospital prices"
- **Who it's for:** Everyday Americans trying to understand healthcare costs before a procedure
- **Space/industry:** Healthcare price transparency, consumer fintech comparison
- **Project type:** Web app (search + results + map) with marketing homepage

## Aesthetic Direction

- **Direction:** Editorial Warmth with Edge
- **Decoration level:** Intentional — strong rules/borders for section separation, map as functional texture. No blobs, no gradients, no stock illustrations.
- **Mood:** A serious consumer report on paper-toned surfaces, energized by coral accent and confident typography. Not a hospital. Not a SaaS dashboard. A sharp tool built by someone frustrated by the same thing you are.
- **Reference sites:** Kayak (data density), NerdWallet (editorial authority), Linear (typography-first confidence), Monocle (warm editorial)
- **Anti-patterns:** No teal/green primary (every competitor owns that space), no purple gradients, no 3-column icon grids, no centered-everything layouts, no decorative blobs, no stock photos of smiling clinicians

## Typography

- **Display/Hero:** Instrument Serif (Google Fonts, weight 400) — classic editorial serif with warmth and authority. Use for hero headlines, savings callouts, brand moments.
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

- **Approach:** Restrained — coral accent is rare and meaningful, green reserved for savings only
- **Rationale:** Every healthcare pricing tool uses teal/green. ClearCost deliberately breaks from this to signal "consumer navigation tool" not "hospital software."

### Light Mode

| Role            | Token                 | Hex                        | Usage                                                                  |
| --------------- | --------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Background      | `--cc-bg`             | `#fafaf8`                  | Page background — clean near-white                                     |
| Surface         | `--cc-surface`        | `#ffffff`                  | Cards, panels, inputs                                                  |
| Surface hover   | `--cc-surface-hover`  | `#f7f7f5`                  | Hover states on surfaces                                               |
| Surface alt     | `--cc-surface-alt`    | `#f5f3ef`                  | Secondary surfaces, badges, pill groups                                |
| Border          | `--cc-border`         | `#e8e5df`                  | Default borders                                                        |
| Border strong   | `--cc-border-strong`  | `#d4d0c8`                  | Emphasized borders, section rules                                      |
| Text            | `--cc-text`           | `#1a1a2e`                  | Primary text — deep ink with blue undertone                            |
| Text secondary  | `--cc-text-secondary` | `#4a4a5e`                  | Supporting text, descriptions                                          |
| Text tertiary   | `--cc-text-tertiary`  | `#78716c`                  | Muted text, metadata, captions                                         |
| Accent (Coral)  | `--cc-primary`        | `#ff6b4a`                  | CTAs, links, active states, brand color                                |
| Accent hover    | `--cc-primary-hover`  | `#e85d3e`                  | Hover state for accent                                                 |
| Accent light    | `--cc-primary-light`  | `#fff0ec`                  | Accent backgrounds, badges                                             |
| Accent subtle   | `--cc-primary-subtle` | `rgba(255, 107, 74, 0.08)` | Focus rings, hover tints                                               |
| Success         | `--cc-success`        | `#059669`                  | Savings, lowest price, Medicare — green is ONLY for "you save" moments |
| Success light   | `--cc-success-light`  | `#ecfdf5`                  | Success backgrounds                                                    |
| Warning (Amber) | `--cc-accent`         | `#d97706`                  | Contextual warnings, "facility fee only", gross prices                 |
| Warning light   | `--cc-accent-light`   | `#fef3c7`                  | Warning backgrounds                                                    |
| Error           | `--cc-error`          | `#dc2626`                  | Errors, highest price markers                                          |
| Error light     | `--cc-error-light`    | `#fef2f2`                  | Error backgrounds                                                      |
| Info            | `--cc-info`           | `#1e40af`                  | Insured/negotiated rate data                                           |

### Dark Mode

| Role           | Token                 | Hex       |
| -------------- | --------------------- | --------- |
| Background     | `--cc-bg`             | `#121218` |
| Surface        | `--cc-surface`        | `#1c1c26` |
| Surface alt    | `--cc-surface-alt`    | `#252530` |
| Border         | `--cc-border`         | `#2e2e3a` |
| Border strong  | `--cc-border-strong`  | `#3e3e4e` |
| Text           | `--cc-text`           | `#e8e6e1` |
| Text secondary | `--cc-text-secondary` | `#a8a6a0` |
| Text tertiary  | `--cc-text-tertiary`  | `#706e68` |
| Accent         | `--cc-primary`        | `#ff7a5c` |
| Success        | `--cc-success`        | `#34d399` |
| Warning        | `--cc-accent`         | `#fbbf24` |
| Error          | `--cc-error`          | `#f87171` |

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — more Kayak than wellness app, but not cramped
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)
- **Component gaps:** 8px between result cards, 24px between sections, 32px between major areas

## Layout

- **Approach:** Asymmetric editorial — left-aligned content, split results view
- **Grid:** Single column with max-width constraint. Results page uses 2-column split (list + map).
- **Max content width:** 1120px
- **Border radius:** Hierarchical — sm:4px (badges, code pills), md:8px (cards, buttons, inputs), lg:12px (panels, map, search bar)
- **Key principles:**
  - Left-align headlines and content — avoid floating centered islands
  - Use strong top borders to introduce sections (editorial style)
  - Data density over whitespace in results — price, distance, facility in one scan line
  - Map is a tool, not decoration — persistent right pane on desktop

## Motion

- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(cubic-bezier(0.16, 1, 0.3, 1))
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **Accordion:** CSS Grid `grid-template-rows: 0fr → 1fr` with 250ms ease-out
- **Scroll reveal:** `opacity 0→1, translateY 20→0px` with 600ms spring easing. Must respect `prefers-reduced-motion`.
- **Hover:** `translateY(-2px)` lift on cards, 200ms ease
- **Focus:** `box-shadow: 0 0 0 3px var(--cc-primary-subtle)` — coral focus ring

## Brand Identity

- **Wordmark:** "ClearCost" — "Clear" in text color, "Cost" in accent coral. Set in Fraunces 500.
- **No logo mark yet** — the wordmark is the brand. Typography-first identity.
- **Voice:** Direct, confident, slightly irreverent. "We are not part of the healthcare system — we cracked it open for you." No corporate hedging, no clinical language.

## Design Innovations

- **Price Spectrum Strip:** Horizontal band at the top of search results showing the full price range with provider dots plotted along it. Communicates variance, position, and savings opportunity in one glance. The thing users screenshot and text to their spouse.
- **Typography-only hero:** Bold Fraunces question ("What does a knee MRI actually cost near you?") with no illustration, no stock photo. The question mirrors what the user is already thinking.

## Decisions Log

| Date       | Decision                        | Rationale                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-03-23 | Initial design system created   | Full redesign consultation with competitive research (Turquoise Health, FAIR Health, Healthcare Price Tool, GoodRx, Kayak, NerdWallet) + Codex + Claude subagent outside voices. All three voices converged on dropping teal, using editorial serif/sans contrast, and coral accent. |
| 2026-03-23 | Coral accent over teal          | Every competitor uses teal/green. Coral (#ff6b4a) sits in a space no healthcare tool occupies — between red and orange — signaling "act on this" without "danger."                                                                                                                   |
| 2026-03-23 | Keep Instrument Serif + DM Sans | Originally proposed Fraunces + Space Grotesk, but reverted to original fonts after seeing them live. The Instrument Serif + DM Sans pairing is proven and distinctive enough with the new coral/cream palette.                                                                       |
| 2026-03-24 | Revert to white backgrounds     | Cream (#f5f0e8) + coral created an "autumn" feel. Original near-white (#fafaf8) is cleaner — coral pops better on white and the overall tone stays professional.                                                                                                                     |
