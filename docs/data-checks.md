# Data checks: proving a load or change lost nothing

Every price a patient sees comes from `charges`, and loads, dedupes and migrations rewrite it all the time. A wrong price is worse than none, and a price that silently disappears looks like "no results". Three layers catch problems, from cheapest to deepest.

| Layer                                                              | When it runs                                                  | What it catches                                                                                                                   | Where results go                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Live price eval (`e2e/price-eval.spec.ts`)                         | After every production deploy and daily, with the smoke suite | Common searches in big cities answering differently from their published city pages: too few hospitals, median moved more than 2x | GitHub Actions (a failed run emails the repo owner)                            |
| Nightly coverage ledger (`snapshot_coverage()`, pg_cron 04:45 UTC) | Every night, after the data-quality counts                    | A hospital pricing fewer codes than the night before, or a code priced by fewer hospitals                                         | `provider_coverage`, `code_coverage`; read with `scripts/data-check.ts ledger` |
| Before/after check (`scripts/data-check.ts`)                       | Around every load, cleanup or data migration                  | Exactly which hospitals and prices a change moved, lost or broke                                                                  | Project folder (`data-quality/checks/`), never the repo                        |

The nightly counts of rows each price filter hides (`data_quality_counts`, #209) sit alongside these and answer a different question: how much the filters catch, not what was lost.

## Before/after check

Run it around anything that writes to `charges`: a state load (`scripts/crawl-mrf.ts --load`), a Trilliant re-import, a dedupe, or a migration that touches prices or codes.

```bash
# 1. Before: name the states the change touches (comma-separated, or none)
npx tsx --env-file=.env.local scripts/data-check.ts snapshot --label before-tx --state TX
# 2. Make the change
# 3. After, then compare
npx tsx --env-file=.env.local scripts/data-check.ts snapshot --label after-tx --state TX
npx tsx --env-file=.env.local scripts/data-check.ts compare before-tx after-tx
```

A snapshot takes about 2.5 minutes and is read-only. It holds two things:

- **What patients see**: every city-page procedure plus three hospital stays (heart bypass, heart valve, kidney transplant), in every city-page metro, within 25 miles. For each search it keeps the headline answer and one price per hospital, worked out by the same lookup, price filters and summary the results page uses.
- **What the database holds** for every hospital in the named states: per code, the row count, priced rows, cash and insured ranges, and when the hospital's own price file was last loaded (`coverage_fingerprint()`).

`compare` writes a Markdown report next to the snapshots and exits 1 on any failure.

| Finding                                                                                                                   | Severity                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A hospital had a cash or insured price in a search and now has none                                                       | Fail (review when outside the named states and the typical prices behind the filters changed between snapshots) |
| A code lost every price at a hospital, or a hospital vanished                                                             | Fail                                                                                                            |
| A newly shown price is more than 10x off the procedure's national typical price                                           | Fail                                                                                                            |
| A price moved at a hospital outside the named states                                                                      | Fail (review if the filters' typical prices changed between snapshots)                                          |
| A price moved more than 25%, or switched between cash and insured, inside the named states                                | Review                                                                                                          |
| A city page would stop publishing, a search lost more than 25% of its priced hospitals, or its median moved more than 25% | Review                                                                                                          |
| Smaller in-scope price moves, newly priced hospitals and codes                                                            | Info                                                                                                            |

A failure doesn't undo anything by itself. It means stop and look before the next state or change. If the loss is real, `restore_mrf_load(provider_id)` puts a hospital's previous rows back. If it's correct (a hospital stopped listing a code, say), record why in the data-issues register.

Two snapshots taken a few minutes apart with no change in between compare clean (checked 2026-10-19: 2,888 searches, 42,810 priced hospital results, zero differences), so any difference is real. The nightly 04:00 UTC typical-price refresh is the one routine thing that moves prices between snapshots; the report says when it happened.

## Nightly coverage ledger

`snapshot_coverage()` records, per hospital, how many codes it has rows for and how many it prices (any of cash, insured or list), and, per code, how many hospitals price it. It keeps 35 nights plus the first of each month. The first nightly run records the baseline, so `ledger` has something to compare from the second night on.

**Paused (2026-10-21).** The full aggregate over `charges` is too heavy for Micro compute: it can't finish inside the 2-minute cap Supabase puts on scheduled jobs, and run longer by hand it used up the disk IO burst and left the database unresponsive for about an hour. It is being rebuilt to read a small slice of `charges` each night. Until then, use the before/after check around every change.

Scheduled jobs run as `postgres`, which Supabase caps at a 2-minute statement timeout, and a function's own `set statement_timeout` doesn't lift the cap for the call that starts it. A job that needs longer sets the session timeout in its cron command (`set statement_timeout = '10min'; select ...`), but only once it is known to be light on disk IO. Check a job with `select * from cron.job_run_details order by start_time desc`.

```bash
npx tsx --env-file=.env.local scripts/data-check.ts ledger                 # latest two nights
npx tsx --env-file=.env.local scripts/data-check.ts ledger --before 2026-10-19 --after 2026-10-26
```

It lists hospitals that lost at least 5 and at least 10% of their priced codes (or disappeared), and codes that lost at least 3 and at least 10% of their hospitals, and exits 1 when there are any. The same query is `select * from coverage_drops();` in SQL.

## Live price eval

`e2e/price-eval.spec.ts` sends six common procedures in eight big metros to the live search API with fixed billing codes and checks each answer against `lib/seo/page-index.json`: at least half the hospitals the page lists (and at least 3), and a median within 2x. Rebuild the index after every load (`scripts/build-seo-index.ts`), as the import steps already say, so the eval compares against current data.

It doesn't test how plain-English searches are matched to codes: each of those checks is a paid Claude call, so it isn't scheduled.
