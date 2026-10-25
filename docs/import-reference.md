# Import Pipeline Reference

> **Owner:** Engineering (Claude) · **Source of truth for:** Import commands, flags, gotchas, DuckDB quirks
> **Update when:** Pipeline code changes

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

**Cash ratios refresh automatically.** At the end of a run the import refreshes the per-hospital cash ratios (which the episode estimator uses to turn insured or gross prices into cash equivalents) for every hospital it loaded, 400 per `refresh_provider_cash_ratios(array[...])` call. Don't run the no-argument `select refresh_provider_cash_ratios();`: it aggregates all of `charges` and then runs `refresh_code_price_reference()`, which outruns the statement timeout on the full table. The nightly 04:00 UTC job refreshes `code_price_reference`.

### Hospitals with a crawled price file

When the crawler loads a hospital (`scripts/crawl-mrf.ts --load`), `apply_mrf_load()` moves that hospital's Oria rows for the same codes into `charges_archive`, so search never shows two prices for one code. The import leaves those rows out too: before writing each batch, one indexed query finds rows whose hospital already has a `cms_mrf` row for the same code (CPT/HCPCS under either label, MS-DRGs without leading zeros), and they are skipped (`lib/data/crawler-overlap.ts`). The per-state log reports `N rows left out — the hospital's crawled price file covers the code`, and reconciliation counts them. Without this, a re-import puts the archived rows back. On 2026-10-22 that added 443,626 duplicate rows at 392 hospitals, and the extra rows pushed other hospitals out of `search_charges_nearby`'s 600-row limit.

### Hospital-stay prices (MS-DRG)

Surgery billed as a hospital stay (bypass, valve, transplants, esophagus and pancreas surgery) is priced from its MS-DRGs, not the CPT line (#173). Those DRGs aren't in the main code list, so load them with a targeted import:

```
npx tsx --env-file=.env.local lib/data/import-trilliant.ts \
  --codes lib/data/import-sets/inpatient-stay-drgs.json
```

For MS-DRG rows the import recomputes the negotiated min/avg/max from payer-level rates in `standard_charge_details`, leaving out per-diem contracts (a daily rate, not the stay). Oria's pre-computed averages mix them in and make stays look 5–10× too cheap. See `lib/data/charge-select.ts`.

Hospital files repeat a code at the same prices many times (77% of the stay-DRG rows loaded on 2026-10-22 were exact copies), and the copies crowd other hospitals out of the search's row limit. Like the crawler (#211), the import keeps one row per distinct price at each hospital, keyed on code, setting, billing class, modifiers, description and every price column, and it skips rows with no price at all. Reconciliation counts against the same deduplicated query.

Imports store `billing_class` and `setting` lowercased with typos fixed (`lib/data/normalize-charge.ts`), so SQL can compare them directly.

### Row lineage and upserts (`source_charge_id`, #59)

Every imported charge stores `source_charge_id` = Oria `standard_charges.charge_id`. Oria's `charge_id` is a row number inside one hospital's file, so it is only unique per hospital (the same id appears at many hospitals). The key is therefore `(provider_id, source_charge_id)`: partial unique index `idx_charges_provider_source_charge_id` (migration `20261022090000_charges_source_charge_id_per_provider.sql`, which replaced the global index from `20261015060000`). Each Oria `hospital_id` maps to one provider (`providers.trilliant_hospital_id` is unique). Batches are written with `INSERT ... ON CONFLICT (provider_id, source_charge_id) WHERE source_charge_id IS NOT NULL DO UPDATE` (`CHARGE_LINEAGE_CONFLICT` in `lib/data/charge-id-guard.ts`), refreshing every imported column plus `last_updated`:

- **Retries are idempotent.** If a batch committed but the ack was lost, the retry updates the same rows instead of duplicating them.
- **Re-runs refresh prices in place.** The state-level DELETE + reimport still runs as before (with `--codes`, one DELETE per code column, so each uses its `(code, provider)` index; a single DELETE OR-ing the three columns walks every charge in the state and times out), so normally every row is a fresh insert. Rows the DELETE misses (e.g. a provider whose `state` was corrected after import) are updated rather than duplicated. The per-state log reports `N rows already present … updated in place` and reconciliation counts them.
- **Uniqueness guard.** Before any TRUNCATE or DELETE, one DuckDB query groups the whole code-filtered scope by `(hospital_id, charge_id)` and the import stops if any pair repeats: one row of a hospital would otherwise overwrite another of the same hospital (`lib/data/charge-id-guard.ts`). Because the conflict target includes `provider_id`, a `charge_id` can never rewrite another hospital's row.
- **Inpatient backfill.** `lib/data/backfill-inpatient.ts` reads the same `standard_charges` source, so it also stores `source_charge_id`, runs the same guard over its scope, and inserts with `ON CONFLICT ... DO NOTHING` (rows the main import already loaded are left alone; re-runs are safe).
- **Backfill.** Rows imported before #59 have `source_charge_id IS NULL` (post-import verification prints the count). They are only filled by re-importing from the local Oria data (`--fresh`, or state-by-state with `--state`). Those NULL rows are not covered by the upsert, so a partial re-import must still rely on the state DELETE to avoid duplicates.
- Pass `charge_id` as text, never `Number()`: it is a DuckDB BIGINT and may exceed 2^53.

## Flags

| Flag                      | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `--skip-providers`        | Providers already loaded, skip re-import                     |
| `--skip-states AK,CA,...` | Skip these states (preserves existing data, no DELETE)       |
| `--state NY`              | Only import one state (bypasses progress file — always runs) |
| `--limit 1000`            | Stop after N charges (for testing)                           |
| `--batch-size 2000`       | Rows per Supabase insert (default: 2000)                     |

## DuckDB Technical Notes

- **Memory**: `SET memory_limit = '2GB'` and `SET threads = 2` to avoid RAM exhaustion on 81GB Parquet. (`generate-snapshot.ts` uses `4GB` — it runs alone, not during imports.)
- **BigInt**: DuckDB returns BigInt — wrap in `Number()` before passing to Supabase/JSON (except IDs that may exceed 2^53, like `charge_id`: pass them as `String()`)
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

**Diff-based resume (not built yet):** with `source_charge_id` populated, a resume could insert only the missing `charge_id`s instead of deleting and reimporting the state. That only matters at Phase 6 scale.

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
