# Next Session Context
**Last updated**: 2026-03-02
**Last session summary**: Imported 359,096 PA charges (issue #5). No code changes — same pipeline that fixed NJ. All acceptance criteria passed: 0.0% drift, top 5 providers healthy, 0 orphans.

## Current State
- **Live**: https://clearcost-orcin.vercel.app (deployed to Vercel, fully functional)
- **Branch**: `data/import-pa-charges` (PR pending — for issue #5)
- **Charge count**: 13,115,268 total (5,419 providers, 1,010 codes, 52 states/DC/PR)
- **PA**: 359,096 charges imported, 186 of 243 providers have charges, 0 orphans, 0.0% drift
- **NJ**: 182,010 charges (imported last session, PR #30 merged)
- Local data files present: `lib/data/mrf_lake/mrf_lake.duckdb` (11MB) + `lib/data/mrf_lake/parquet/` (81GB)

## Next Steps
- [ ] **Issue #11**: Full audit + manual QA verification (critical — before launch)
- [ ] **Issue #17**: Remove non-functional payer filter (high, frontend)
- [ ] **Issue #14**: Billing class contextual callouts (high, frontend)
- [ ] **Issue #13**: Loading skeleton states (high, frontend)
- [ ] **Issue #23**: Mobile end-to-end QA (critical, frontend)
- [ ] **Issue #22**: Pre-launch verification checklist

## Known Issues / Gotchas
- **Auto-resume gotcha**: If you run a `--limit N` test, those rows mark the state as "completed" in the auto-resume check. You must DELETE the test rows before the full import, or the state gets skipped.
- **`final-codes.json` is a flat string array**, not objects — `JSON.parse()` returns `string[]`, not `{code: string}[]`. Scripts that consume it must use the values directly.
- **`export-csv.ts` doesn't exist** — the COPY pipeline's first step was never written. The INSERT pipeline (`import-trilliant.ts`) is the only working import path.
- **Null bytes in source data**: Fixed in `flushOneBatch()` — applies to all states.
- **Re-downloaded data new layout**: `lib/data/mrf_lake/mrf_lake.duckdb` and `lib/data/mrf_lake/parquet/` (nested inside `mrf_lake/`). Script handles this via `__dirname`.
- **Supabase daily I/O limits**: Don't run a full 50-state import with `--parallel 4`. Use `--parallel 2` or spread over 2 days.

## Key Constraints (learned the hard way)
- **NEVER run `npm run build` during import work** — Turbopack eats 40GB+ RAM and freezes the machine
- **Kill import if heap > 500MB** — indicates something is wrong with DuckDB streaming
- **Always test with `--limit 100` before full run** — catches connectivity and path issues in seconds
- **DuckDB CWD matters**: import-trilliant.ts auto-`chdir`s to the DuckDB directory. If writing new DuckDB scripts, CWD to the file's directory for parquet paths to resolve.
- **psql not installed** — use `pg` npm package for Postgres access. Use `-e` flag with `async function main(){}; main()` pattern (no top-level await in CJS context).
- **DuckDB column names differ from Supabase**: DuckDB uses `hospital_state` on both `hospitals` and `standard_charges` tables. Supabase uses `state` on `providers`.
