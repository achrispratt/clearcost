# Import Pipeline Reference

Detailed reference for `lib/data/import-trilliant.ts` — the only working import path (Node.js INSERT via Supabase pooler port 6543, ~470 rows/s).

## Commands

**Fresh import** (wipe and reload all data):

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts
```

**Resume import** (keep existing states, import remaining):

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts \
  --skip-providers \
  --skip-states AK,AL,AR,AZ,CA,CO,CT,DC,DE,FL
```

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
| `--state NY`              | Only import one state                                  |
| `--limit 1000`            | Stop after N charges (for testing)                     |
| `--batch-size 2000`       | Rows per Supabase insert (default: 2000)               |

## DuckDB Technical Notes

- **Memory**: `SET memory_limit = '2GB'` and `SET threads = 2` to avoid RAM exhaustion on 81GB Parquet. (`generate-snapshot.ts` uses `4GB` — it runs alone, not during imports.)
- **BigInt**: DuckDB returns BigInt — wrap in `Number()` before passing to Supabase/JSON
- **CWD**: Oria DuckDB views use relative paths to `parquet/` — must CWD to `lib/data/mrf_lake/` when querying. `import-trilliant.ts` does this automatically.
- **Column mismatch**: DuckDB uses `hospital_state` on both tables; Supabase uses `state` on `providers`
- **`final-codes.json` format**: Flat `string[]`, not `{code: string}[]`. Scripts consume values directly.

## Gotchas

- **Auto-resume trap**: `--limit N` test runs mark a state as "completed" in auto-resume. DELETE test rows before full import or the state gets skipped.
- **Null bytes**: NJ source data had null bytes (0x00) in text fields — sanitized in `flushOneBatch`
- **hcpcs vs cpt**: Many hospitals code under `hcpcs` column instead of `cpt` — always check BOTH
- **Supabase I/O limits**: Pro plan has daily CPU/IO budget. Use `--parallel 2` for future runs, or spread across 2 days.
- **Memory expectation**: Script uses streaming (`db.stream()`) + 3 concurrent inserts. Expected ~50-100MB heap. If it exceeds 500MB, something is wrong — kill it.

## Pipeline That Was Never Built

`export-csv.ts` / COPY pipeline was never built — don't attempt it. The INSERT path via pooler (port 6543) is the only working path.

## Future

- Incremental refresh via `last_updated_on` — only reimport changed hospitals
- State-by-state processing keeps DuckDB memory manageable
