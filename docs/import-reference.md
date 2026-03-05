# Import Pipeline Reference

Detailed reference for `lib/data/import-trilliant.ts` — the only working import path (Node.js INSERT via Supabase pooler port 6543, ~470 rows/s).

## Commands

**Fresh import** (wipe and reload all data):

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts
```

**Resume import** (auto-resumes from where it left off — no flags needed):

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts --skip-providers
```

The pipeline checks `lib/data/import-progress.json` for completed states, then falls back to checking Supabase row counts for states imported before progress tracking was added. No need to manually specify `--skip-states`.

**Test import** (verify script works with small dataset):

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts \
  --skip-providers --state WY --limit 1000
```

## Flags

| Flag                      | Purpose                                                |
| ------------------------- | ------------------------------------------------------ |
| `--skip-providers`        | Providers already loaded, skip re-import               |
| `--skip-states AK,CA,...` | Skip these states (preserves existing data, no DELETE) |
| `--state NY`              | Only import one state (bypasses progress file — always runs) |
| `--limit 1000`            | Stop after N charges (for testing)                     |
| `--batch-size 2000`       | Rows per Supabase insert (default: 2000)               |

## DuckDB Technical Notes

- **Memory**: `SET memory_limit = '2GB'` and `SET threads = 2` to avoid RAM exhaustion on 81GB Parquet. (`generate-snapshot.ts` uses `4GB` — it runs alone, not during imports.)
- **BigInt**: DuckDB returns BigInt — wrap in `Number()` before passing to Supabase/JSON
- **CWD**: Oria DuckDB views use relative paths to `parquet/` — must CWD to `lib/data/mrf_lake/` when querying. `import-trilliant.ts` does this automatically.
- **Column mismatch**: DuckDB uses `hospital_state` on both tables; Supabase uses `state` on `providers`
- **`final-codes.json` format**: Flat `string[]`, not `{code: string}[]`. Scripts consume values directly.

## Auto-Resume & Progress Tracking

Successful state completions are recorded in `lib/data/import-progress.json` (gitignored). The auto-resume logic:

1. **Progress file** (authority): States listed → skip entirely
2. **Bootstrap**: First run after upgrade seeds progress file from Supabase row counts (one-time migration)
3. **DELETE + reimport**: Any state NOT in progress file gets its charges deleted before reimport — cleans up partial data from crashes automatically
4. **`--state WY`** bypasses progress check — explicit state always runs (DELETE + reimport)
5. **`--fresh`** deletes the progress file + truncates the table
6. **`--limit N`** runs do NOT record progress — safe for testing

**Self-healing on crash:** If the pipeline crashes mid-state, that state is NOT in the progress file → next run deletes the partial data and reimports from scratch. No manual intervention needed.

## Gotchas

- **`--limit N` is test-safe**: Test runs with `--limit` do not record progress, so they won't poison auto-resume. Test rows are still inserted though — delete them manually before a full import if needed.
- **Null bytes**: NJ source data had null bytes (0x00) in text fields — sanitized in `flushOneBatch`
- **hcpcs vs cpt**: Many hospitals code under `hcpcs` column instead of `cpt` — always check BOTH
- **Supabase I/O limits**: Pro plan has daily CPU/IO budget. Use `--parallel 2` for future runs, or spread across 2 days.
- **Memory expectation**: Script uses streaming (`db.stream()`) + 3 concurrent inserts. Expected ~50-100MB heap. If it exceeds 500MB, something is wrong — kill it.

## Pipeline That Was Never Built

`export-csv.ts` / COPY pipeline was never built — don't attempt it. The INSERT path via pooler (port 6543) is the only working path.

## Future

- Incremental refresh via `last_updated_on` — only reimport changed hospitals
- State-by-state processing keeps DuckDB memory manageable
