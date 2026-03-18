# ClearCost

**Kayak for healthcare pricing** — search for any medical procedure in plain English and instantly compare real hospital prices near you.

**Live:** [clearcost-orcin.vercel.app](https://clearcost-orcin.vercel.app)

---

## What It Does

Type "knee MRI near Austin, TX" and get a sorted list of hospitals with actual cash prices, negotiated rate ranges, and distance — on a list or map view. ClearCost bridges the gap between how patients describe procedures and how hospitals code them, using AI to translate plain English into billing codes and federal price transparency data to show real prices.

**Key features:**

- **AI-powered search** — Claude translates natural language to CPT/HCPCS billing codes
- **Guided clarification** — Vague queries ("my knee hurts") get narrowed through a diagnostic Q&A flow
- **Translation Knowledge Base** — Caches AI responses as a conversation tree; repeat searches cost zero AI calls
- **National coverage** — 5,400+ hospitals, 1,002 curated procedure codes, all 50 states
- **Real prices** — Cash prices, gross charges, and aggregated payer-negotiated rate stats from hospital MRF data
- **Map + list views** — Google Maps integration with price-labeled pins
- **Save searches** — Google OAuth sign-in to bookmark results

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 + DaisyUI 5 |
| Database | Supabase (Postgres + PostGIS) |
| Auth | Supabase Auth (Google OAuth) |
| AI | Claude API via Anthropic SDK |
| Maps | Google Maps JavaScript API |
| Data | Trilliant Oria hospital MRF dataset (81GB Parquet) |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase project with PostGIS enabled
- API keys: Anthropic (Claude), Google Maps

### Setup

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/achrispratt/clearcost.git
cd clearcost
npm install
```

2. Copy the environment template and fill in your keys:

```bash
cp .env.local.example .env.local
```

Required variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

3. Set up the database schema:

Run `supabase/schema.sql` in the Supabase SQL editor (or via CLI).

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How Search Works

```
User: "knee MRI near Austin, TX"
  |
  v
KB Lookup ── hit? ──> Return cached codes (zero AI cost)
  |
  | miss
  v
Claude AI translates to billing codes (CPT 73721)
  + writes result to KB for next time
  |
  v
PostGIS: search_charges_nearby(codes, lat, lng, radius)
  |
  v
Results: sorted by cash price, filterable, map + list views
```

For vague queries ("my knee hurts"), a multi-turn guided clarification loop narrows to specific codes through up to 6 diagnostic questions.

## Project Structure

```
app/
  api/          — Search, translation, clarification, KB events, saved searches
  guided-search/ — AI diagnostic clarification page
  legal/        — Terms, Privacy, Disclaimers
  results/      — Search results page
components/     — UI components (SearchBar, ResultCard, FilterBar, MapView, landing sections, etc.)
lib/
  cpt/          — Billing code translation logic
  kb/           — Translation Knowledge Base (caching + synonym clustering)
  supabase/     — Database clients (browser, server, middleware)
scripts/        — DB migrations, seed scripts, audits
types/          — Shared TypeScript interfaces
supabase/       — Schema SQL + migrations
docs/           — PRD, data snapshots, research, import reference
```

## Data Source

Pricing data comes from [Trilliant Health's Oria](https://www.trillianthealth.com/) — a consolidated data lake of hospital Machine-Readable Files (MRFs) required by the federal Hospital Price Transparency Rule. The MVP imports 1,002 curated procedure codes across 5,400+ hospitals nationally.

## Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Setup, dev workflow, code conventions, design system
- **[CLAUDE.md](./CLAUDE.md)** — Architecture, search flow, database schema, and roadmap
- **[docs/prd.md](./docs/prd.md)** — Product requirements document
- **[docs/billing-code-guide.md](./docs/billing-code-guide.md)** — Billing code structure and data interpretation
- **[docs/data-snapshot.md](./docs/data-snapshot.md)** — Current data coverage numbers
- **[docs/import-reference.md](./docs/import-reference.md)** — Data import pipeline reference
- **[docs/gtm-strategy.md](./docs/gtm-strategy.md)** — Go-to-market strategy

## License

All rights reserved. This is a proprietary project.
