# Charge Deduplication Investigation — 2026-03-03

GitHub Issue: #8 ("Investigate + deduplicate existing charges")

## Summary

The charges table (13,115,268 rows) contains ~4.7M rows that share identical values on all columns **except** `revenue_code`, `ndc`, `icd`, `id`, `created_at`, and `last_updated`. After investigation, we determined the aggressive dedup (excluding `revenue_code` from the grouping) is safe because it preserves all distinct price points.

## Root Cause: Source Data, Not Import Pipeline

Duplicates originate in the **Trilliant Oria Parquet source data**, not from repeated imports. Evidence:

- All duplicate rows for a given provider+code share the **exact same `created_at` timestamp** (e.g., `2026-02-20T14:12:43.780Z`), confirming they were inserted in a single batch during a single import run.
- The import verification (DuckDB row count vs Supabase row count) passed because both contained the same duplicates.
- The import pipeline has no dedup logic — it faithfully reproduces what's in the source.

## Why the Source Has Duplicates

Two patterns were identified:

### Pattern 1: Revenue Code Variants (~90% of "duplicates")

Hospital MRF files list the same procedure under **multiple revenue codes** (internal department classifications). Example:

```
Las Palmas Rehab, CPT 73590 (X-ray lower leg): 122 source rows

Row 1:  rc=null  → avg_negotiated=$99.89, payer_count=18   (unique price)
Row 2:  rc=300   → avg_negotiated=$73.53, payer_count=3    (Lab - General)
Row 3:  rc=301   → avg_negotiated=$73.53, payer_count=3    (Chemistry)
Row 4:  rc=302   → avg_negotiated=$73.53, payer_count=3    (Hematology)
...
Row 68: rc=925   → avg_negotiated=$31.74, payer_count=1    (EKG)
```

Rows 2-14 have the same prices but different `rc` values. They represent the same X-ray priced identically across departments. For consumers, these are noise — the user cares about the price, not which department bills it.

In TX alone: **1,410,936 rows** are revenue code variants (same prices, different RC). Only **163,679** are true all-column duplicates.

### Pattern 2: True All-Column Duplicates (~10% of "duplicates")

Some rows are identical across every column including `revenue_code`. Example:

```
Baylor Scott & White Heart Hospital - Plano, HCPCS 86003:
  94 copies of "HC ALLERGEN SPECIFIC IGE - QUANT,EA" at $44.47
  All have: billing_class=facility, setting=outpatient, same negotiated rates
  Same created_at timestamp — all from one import batch
```

The hospital also has 587 specific allergen descriptions (apple, banana, etc.) under the same code — those are NOT duplicates and are untouched.

## Dedup Decision: Aggressive (Exclude revenue_code)

**Chosen approach:** PARTITION BY excludes `revenue_code`, `ndc`, `icd`. This collapses both true duplicates AND revenue code variants with identical prices.

### Why This Is Safe

1. **Zero price information is lost.** All 7 price columns (`cash_price`, `gross_charge`, `min_price`, `max_price`, `avg_negotiated_rate`, `min_negotiated_rate`, `max_negotiated_rate`) plus `payer_count` are in the PARTITION BY. Any row with a different price survives. Verified: TX has 1,177,211 distinct (provider, code, price) combos before and after.

2. **Revenue code variants with different prices survive.** Cases where different RCs have different negotiated rates (e.g., Las Palmas ER West: 67 RCs, 10 distinct avg_neg rates) are preserved because the prices differ, putting them in different partitions.

3. **Revenue codes don't represent additive cost components.** RC 300 (Lab) vs RC 301 (Chemistry) for the same CPT code means "different departments could bill this," not "the patient pays both." Total cost-of-care bundling (procedure + professional fee + drugs) requires relating different CPT/HCPCS codes, not different revenue codes for the same code. This is a Claude AI knowledge layer problem (issue #38), unaffected by dedup.

4. **Cleaner search results.** Collapsing 122 rows to 16 distinct price points for one hospital+code means the search RPC's `p_limit` and `p_provider_limit` aren't consumed by redundant rows.

5. **Source data is preserved.** The 81GB Parquet source (`lib/data/mrf_lake/parquet/`) is always available for re-import if revenue code analysis is needed in the future.

### Dedup SQL (per state)

```sql
DELETE FROM charges WHERE id IN (
  SELECT id FROM (
    SELECT c.id, ROW_NUMBER() OVER (
      PARTITION BY c.provider_id,
        COALESCE(c.cpt, ''), COALESCE(c.hcpcs, ''), COALESCE(c.ms_drg, ''),
        COALESCE(c.description, ''), COALESCE(c.billing_class, ''),
        COALESCE(c.setting, ''), COALESCE(c.modifiers, ''),
        c.cash_price, c.gross_charge, c.min_price, c.max_price,
        c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
        c.payer_count
      ORDER BY c.created_at ASC, c.id ASC
    ) AS row_num
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
  ) ranked WHERE row_num > 1
);
```

Keeps the earliest row per group (`ORDER BY created_at ASC, id ASC`). Processes state-by-state to avoid timeouts and stay within Supabase Pro CPU/IO budget.

## Execution Status — COMPLETE

### Run 1 (2026-03-03, 21:03–21:27)

- **Before:** 13,109,363 charges (after WY test dedup)
- **Completed 39 states:** AK, AL, AR, AZ, CA, CO, CT, DC, DE, FL, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA
- **Removed:** 2,602,545 rows
- **Hit Supabase Pro daily CPU/IO limit** after PA — database went read-only then unreachable

### Run 2 (2026-03-03, 21:34–21:49)

- **Before:** 10,506,818 charges
- **Completed 12 states:** PR (145), RI (1,365), SC (46,927), SD (958), TN (295,117), TX (1,574,615), UT (86,013), VA (106,946), VT (357), WA (20,207), WI (12,147), WV (3,873)
- **Removed:** 2,148,670 rows
- TX was the heaviest single state: 3,006,921 → 1,432,306 (52.4% reduction, 11 min)

### Final Impact

- **Before:** 13,115,268 charges
- **Removed:** 4,757,120 rows (36.3%)
- **After:** 8,358,148 charges
- **Post-dedup verification:** 0 remaining duplicate groups
- **WY test run:** 38,505 → 32,600 (5,905 removed, verified clean before full run)

## Deferred Items (Issue #10)

- **Unique index** on charges: decision deferred until after dedup patterns are understood (now understood). Candidate key: `(provider_id, cpt, hcpcs, ms_drg, description, billing_class, setting, modifiers)` + price columns. Lives in issue #10.
- **ON CONFLICT DO NOTHING** on import pipeline: requires unique index. Also #10.
- **DELETE-before-INSERT per state**: alternative prevention strategy, also in #10.

## Files

- `scripts/investigate-duplicates.ts` — Read-only investigation (state-by-state GROUP BY)
- `scripts/deduplicate-charges.ts` — Batched DELETE with --dry-run, --state, --skip-states
- `scripts/check-dup-detail.ts` — Diagnostic: inspects metadata of specific dup groups
- `scripts/check-dup-distribution.ts` — Diagnostic: code-level distribution of dupes
- `scripts/check-source-dupes.ts` — Diagnostic: inspects full Parquet source columns
- `scripts/check-rc-impact.ts` — Diagnostic: compares with/without revenue_code in grouping
- `scripts/check-price-preservation.ts` — Diagnostic: verifies zero price info lost
- `supabase/migrations/20260303_deduplicate_charges.sql` — Migration (created after execution)
