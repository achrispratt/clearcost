# Contributing to ClearCost

Welcome! This guide covers everything you need to set up, develop, and ship code for ClearCost.

For architecture, database schema, and search flow details, see [CLAUDE.md](./CLAUDE.md).

---

## Prerequisites

- **Node.js 20+** and npm
- **Supabase project** with PostGIS enabled ([supabase.com](https://supabase.com))
- **API keys**: Anthropic (Claude), Google Maps
- **GitHub CLI** (`gh`) for issue/PR workflow

## Local Setup

1. **Clone and install:**

```bash
git clone https://github.com/achrispratt/clearcost.git
cd clearcost
npm install
```

2. **Environment variables:**

Copy the template and fill in your keys:

```bash
cp .env.local.example .env.local
```

| Variable                          | Purpose                                 |
| --------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase public/anon key                |
| `SUPABASE_SERVICE_ROLE_KEY`       | Server-side Supabase admin access       |
| `ANTHROPIC_API_KEY`               | Claude API for billing code translation |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps (geocoding + map view)      |

3. **Database schema:**

Run `supabase/schema.sql` in the Supabase SQL editor. This creates all tables, indexes, RPC functions, and RLS policies.

4. **Start the dev server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Machine Safety

**DO NOT run `npm run build` during data import work or on memory-constrained machines.** Next.js/Turbopack builds can consume 40GB+ RAM, causing the system to swap and freeze.

- To verify/type-check a script: run it directly with `npx tsx` and `--limit 100`
- `npm run build` and `npx tsx <script>` are completely unrelated — the build compiles the web app; tsx runs a standalone script
- If Node.js memory exceeds 500MB during any operation, something is wrong — kill it immediately

### No Test Framework

There is no Jest, Vitest, or test infrastructure configured. Do not attempt to run tests. Type-checking (`npx tsc --noEmit`) and linting (`npm run lint`) are the primary verification tools.

---

## Development Workflow

All work is tracked via GitHub Issues on the [ClearCost MVP project board](https://github.com/users/achrispratt/projects/2).

### Standard flow

1. Pick an issue from the board
2. Read it: `gh issue view <number>`
3. Create a feature branch: `git checkout -b <type>/<short-description>`
4. Do the work — commit frequently with clear messages
5. Push and open a PR: `gh pr create`, linking the issue (use "Closes #N" in the PR body)
6. Review and merge — issue auto-closes on merge

### Branch naming

| Prefix | Use for |
|--------|---------|
| `feat/` | New features, UI additions |
| `fix/` | Bug fixes |
| `data/` | Data pipeline, import, quality work |
| `infra/` | Security, deployment, tooling |
| `refactor/` | Code cleanup, no behavior change |

### Branching rules

- **Always use feature branches + PRs** for issue-tracked work. This keeps `main` clean and creates an audit trail.
- **Commit directly to `main` only for** trivial fixes (typos, comment updates, CLAUDE.md changes) that don't warrant a PR.
- Keep branches short-lived (merge within 1-2 sessions). Stale branches create confusion.

### Commits

- Commit frequently with clear messages. Small, focused commits are easier to review and revert.
- Don't batch up many unrelated changes into one commit.

### Merging

- Merging a behind branch into `main` is safe — Git combines histories, it doesn't overwrite. The only dangerous operation is `git push --force`.
- When in doubt about branch state: `git log --oneline main..branch-name` shows what the branch adds.

### Creating new issues

Always assign to the project and set a milestone:

```bash
gh issue create --title "..." --body "..." \
  --milestone "MVP App Ready" \
  --label "enhancement" \
  --project "ClearCost MVP"
```

Milestones: `MVP Data Complete`, `MVP App Ready`, `Launch`, `Growth`

### Planning & docs

- Planning documents go directly on `main`. They don't need branch isolation.
- `CLAUDE.md` is the primary source of architectural knowledge. Update it when the system changes.
- GitHub Issues are the source of truth for work tracking. Issue # = priority order.

---

## Code Conventions

### Imports

Group by external packages first, then internal using the `@/` path alias:

```typescript
import { NextRequest, NextResponse } from "next/server";

import { translateQueryToCPT } from "@/lib/cpt/translate";
import { kbLookup } from "@/lib/kb/lookup";
import type { KBResolutionPayload } from "@/types";
```

### Types

Use interfaces from `types/index.ts` — do not create parallel type definitions in component files.

### Error handling

- `try/catch` for async operations
- Display user-facing errors with `react-hot-toast`

### API routes

- Feature-organized in `app/api/`
- Always use the **server** Supabase client (async) — see the [client pattern table in CLAUDE.md](./CLAUDE.md#architecture-supabase-client-pattern)

### Formatting & linting

- **Prettier** (config in `.prettierrc`) for code formatting
- **ESLint** flat config (v9) extending `next/core-web-vitals` + `next/typescript` + `eslint-config-prettier`
- **CI** (GitHub Actions): format check, lint, type check, and build run on every PR

```bash
npm run lint          # Run ESLint
npx prettier --check . # Check formatting
npx tsc --noEmit      # Type check
```

### React patterns

- **Hooks with timers** (`setTimeout`/`setInterval`): always add `useEffect` cleanup on unmount to prevent orphaned timers
- **Imperative API effects** (Google Maps, D3): split data-creation effects from selection/styling effects — avoid full object recreation on state changes

---

## Design System

ClearCost uses a warm editorial aesthetic — trustworthy, clean, approachable.

| Element | Value |
|---------|-------|
| Background | Warm whites (`#FAFAF8`) |
| Primary | Teal (`#0F766E`) |
| Accent | Amber (`#D97706`) |
| Heading font | Instrument Serif |
| Body font | DM Sans |
| Component library | DaisyUI 5 |
| Theme | Light mode only (MVP) |

**References:** Zocdoc, GoodRx for trust/cleanliness; [Sidecar Health cost calculator](https://cost.sidecarhealth.com/) for price display patterns.

### CSS custom properties

Colors and design tokens are defined in `app/globals.css` with the `--cc-*` prefix. Always use these instead of raw hex values:

```css
/* Do this */
color: var(--cc-primary);

/* Not this */
color: #0F766E;
```

---

## Deployment

ClearCost deploys to **Vercel** automatically on merge to `main`.

- Production URL: [clearcost-orcin.vercel.app](https://clearcost-orcin.vercel.app)
- Every PR gets a preview deployment
- Environment variables are configured in the Vercel dashboard

---

## Key Documentation

| Document | What it covers |
|----------|---------------|
| [CLAUDE.md](./CLAUDE.md) | Architecture, search flow, database, key types, safety rules |
| [docs/prd.md](./docs/prd.md) | Product requirements, vision, roadmap |
| [docs/billing-code-guide.md](./docs/billing-code-guide.md) | Billing code structure, charge anatomy, data interpretation |
| [docs/data-snapshot.md](./docs/data-snapshot.md) | Current data coverage numbers |
| [docs/import-reference.md](./docs/import-reference.md) | Data import pipeline flags, quirks, and resume workflow |
| [supabase/schema.sql](./supabase/schema.sql) | Full database schema |
