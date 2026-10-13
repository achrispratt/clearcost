# Repository Guidelines

## Project Structure & Module Organization

ClearCost is a Next.js 16 App Router project. Put pages, layouts, and API handlers in `app/` (`app/api/*/route.ts` for server endpoints). Shared UI lives in `components/`, including landing-page sections under `components/landing/`. Core logic lives in `lib/` (`lib/cpt`, `lib/kb`, `lib/supabase`). Tests live in `__tests__/` with `unit/` for pure helpers and `api/` for route behavior. Keep database assets in `supabase/`, data tooling in `scripts/`, static files in `public/`, and deeper docs in `docs/`.

## Build, Test, and Development Commands

- `npm run dev` starts the local app at `http://localhost:3000`.
- `npm test` runs the Vitest suite once.
- `npm run test:watch` reruns tests during development.
- `npm run lint` runs ESLint with the Next.js flat config.
- `npm run format` writes Prettier formatting; `npm run format:check` verifies it.
- `npx tsc --noEmit` performs a standalone type check.
- `npm run build` creates the production build; CI also runs this on every PR.

## Coding Style & Naming Conventions

Use TypeScript, 2-space indentation, double quotes, semicolons, and trailing commas where Prettier applies them. Prefer `@/` imports for internal modules and group imports as external first, internal second. Use PascalCase for React components (`ResultCard.tsx`), `use*` for hooks (`useResultsSearch.ts`), and reuse shared types from `types/` instead of redefining shapes locally. Prefer CSS tokens from `app/globals.css` (`--cc-*`) over raw color values.

## Testing Guidelines

Vitest runs in a Node environment with globals enabled. Name tests `*.test.ts` and place them under `__tests__/unit` or `__tests__/api` to match scope. Add regression tests for bug fixes, cover both branches when adding conditionals, and mock Supabase or Anthropic calls in API-route tests rather than hitting live services.

## Commit & Pull Request Guidelines

Recent history uses short conventional-style subjects such as `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, and `chore:`; keep the subject imperative and focused, optionally appending an issue reference like `(#144)`. Open PRs from short-lived branches such as `feat/results-table` or `fix/accordion-state`. PRs should include a concise summary, linked issue (`Closes #N` when applicable), screenshots for UI changes, and notes for schema or environment updates. Ensure formatting, lint, type-check, tests, and build all pass before review.

## Security & Configuration Tips

Copy `.env.local.example` to `.env.local` and never commit secrets. Required local integrations include Supabase, Anthropic, and Google Maps keys. Apply schema changes through `supabase/schema.sql` or tracked migration files, and document contributor-facing behavior changes in `README.md`, `CONTRIBUTING.md`, or `docs/`.
