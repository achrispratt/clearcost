# ClearCost Data Funnel & Price Coverage Analysis

> **Owner:** Engineering (Claude) · **Source of truth for:** Data pipeline logic, price gap analysis, expansion path
> **Update when:** Import pipeline or data scope changes

_Created: 2026-03-03_
_Purpose: Inform product strategy around price display, data gaps, and future expansion_

This document traces the full data journey from the raw regulatory dataset to what a user actually sees on screen — including where data drops off, why, and what the implications are for ClearCost's product narrative.

---

## 1. The Raw Data Universe

The Hospital Price Transparency Rule (Jan 2021) requires all US hospitals to publish machine-readable files (MRFs) containing their prices. Trilliant Health's Oria data lake aggregates and normalizes these MRFs into a queryable dataset.

| Metric                                 |          Value |
| -------------------------------------- | -------------: |
| Hospitals in Oria                      |          6,039 |
| Total standard charges (line items)    |    274,299,828 |
| Total payer-specific detail rows       | ~6,381,000,000 |
| Distinct CPT codes                     |        120,097 |
| Distinct HCPCS codes                   |        109,354 |
| Distinct MS-DRG codes                  |          5,628 |
| Raw data size (Parquet + DuckDB index) |         ~81 GB |

This is the full scope of what hospitals are federally required to disclose. Every row represents a single charge line item at a specific hospital for a specific billing code.

---

## 2. The Funnel: Raw → MVP

Each filter step narrows the dataset with a clear rationale. The funnel is designed to be expanded in future phases — nothing is permanently discarded.

```
                    THE DATA FUNNEL
                    ═══════════════

┌─────────────────────────────────────────────────────────┐
│  TRILLIANT ORIA FULL DATASET                            │
│  274,299,828 standard charges                           │
│  ~6.4 billion payer detail rows                         │
│  6,039 hospitals · 120K CPT · 109K HCPCS · 5.6K DRG    │
│  ~81 GB local (Parquet + DuckDB)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  Filter 1: Hospital │
              │  status=completed   │
              │  only               │
              └─────────┬──────────┘
                        │  Drops 620 hospitals (MRF download or parse errors)
                        │  These are Trilliant data quality failures, not our filter
                        │
┌───────────────────────▼─────────────────────────────────┐
│  5,419 HOSPITALS WITH COMPLETE DATA                     │
│  Still 274M charges (620 hospitals had minimal data)    │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  Filter 2: Code     │
              │  1,002 curated      │
              │  CPT/HCPCS codes    │
              └─────────┬──────────┘
                        │  Keeps rows where cpt OR hcpcs matches our list
                        │  Drops ~95% of rows — most line items are for codes
                        │  outside the 1,002 most shoppable procedures
                        │
┌───────────────────────▼─────────────────────────────────┐
│  ~13.1M CHARGE ROWS (1,002 codes × 5,419 hospitals)    │
│  4.8% of total standard charges                         │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────▼──────────┐
              │  Filter 3: Payer    │
              │  aggregates only    │
              │  (skip 6.4B detail  │
              │   rows entirely)    │
              └─────────┬──────────┘
                        │  Uses pre-computed avg/min/max negotiated rates
                        │  from the standard_charges table
                        │  Individual payer breakdown deferred to Phase 7
                        │
┌───────────────────────▼─────────────────────────────────┐
│  SUPABASE (LIVE PRODUCTION)                             │
│  13,115,268 charges · 5,419 providers                   │
│  5,409 geocoded (99.8%) · 10 unfixable                  │
│  ~3.9 GB in Postgres                                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │  ← THIS IS WHERE THE PRICE GAPS EMERGE
                        │
              ┌─────────▼──────────┐
              │  Filter 4: What the │
              │  hospital actually   │
              │  published in their  │
              │  MRF                 │
              └─────────┬──────────┘
                        │  We imported every field the MRF contained
                        │  But hospitals DON'T always fill every column
                        │  This is not our filter — it's source data quality
                        │
┌───────────────────────▼─────────────────────────────────┐
│  WHAT USERS ACTUALLY SEE                                │
│                                                         │
│  Price field coverage (sampled across full dataset):    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  cash_price:          48% populated, 52% null   │    │
│  │  gross_charge:        48% populated, 52% null   │    │
│  │  avg_negotiated_rate: 81% populated, 19% null   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Combined user experience:                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  29%  Both cash + insured rate    Full picture  │    │
│  │  19%  Cash price only             Cash works    │    │
│  │  52%  Insured rate only           "Price N/A"   │    │
│  │   0%  Neither                     Never happens │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. The Price Gap in Detail

### 3.1 What the MRF Columns Mean

CMS requires hospitals to publish five categories of pricing. Our `charges` table maps to them:

| CMS Requirement                | Our Column            | What It Means                                                     | Population |
| ------------------------------ | --------------------- | ----------------------------------------------------------------- | ---------- |
| Gross charge (list price)      | `gross_charge`        | The hospital's undiscounted sticker price. Nobody pays this.      | ~48%       |
| Discounted cash price          | `cash_price`          | What a self-pay/uninsured patient actually pays                   | ~48%       |
| Payer-specific negotiated rate | `avg_negotiated_rate` | Average of what insurers negotiated (pre-aggregated by Trilliant) | ~81%       |
| De-identified minimum          | `min_negotiated_rate` | Lowest insurer rate (anonymized)                                  | ~81%       |
| De-identified maximum          | `max_negotiated_rate` | Highest insurer rate (anonymized)                                 | ~81%       |

### 3.2 Why Cash Price Is Missing for 52%

Hospital MRF compliance varies significantly. The `cash_price` field is null when:

1. **The hospital didn't publish a self-pay rate.** Many hospitals — especially large academic medical centers and public hospital systems — don't have a formal self-pay/cash discount program. They filed their MRF with negotiated rates but left the cash column blank.

2. **The Trilliant parser couldn't extract it.** Some MRFs use non-standard schemas. If the cash price field is labeled differently or nested in an unexpected structure, Trilliant's parser may not capture it even though the hospital intended to disclose it.

3. **The hospital genuinely doesn't offer cash pricing for that procedure.** Some services (e.g., complex surgeries) are only available through insurance at certain facilities.

### 3.3 Correlation Between cash_price and gross_charge

When `cash_price` is null, `gross_charge` is almost always null too (99% correlation). This suggests the gap is at the hospital/MRF level, not per-field — entire hospitals are either publishing cash+gross or publishing neither.

---

## 4. What This Means for Product Strategy

### 4.1 The Cash-Forward Narrative Problem

ClearCost's original value proposition:

> "Search for a procedure. See what it costs. Pay cash."

This works perfectly for 48% of charges. For the other 52%, the user sees "Price unavailable" in the primary price slot, even though an insured average rate is available in the footer.

**The risk**: A user searches for "knee MRI near me," sees 10 results, and 5 of them say "Price unavailable." That undermines trust in the product, even though we have _some_ price data for all of them.

### 4.2 Option Space

| Approach                                                                                                                       | Pros                                                    | Cons                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **A. Show best available price as primary** — Display cash when available, fall back to avg insured rate with a label change   | No "Price unavailable" ever. User always sees a number. | Mixes apples and oranges. Cash price and insured rate are fundamentally different. |
| **B. Separate tabs/views** — "Cash prices" tab shows only the 48% with cash data; "Insured estimates" shows the rest           | Clean separation. Each view is internally consistent.   | Confusing UX. Halves the result count in cash view.                                |
| **C. Always show, clearly label** — Show the price field (cash or insured) with a prominent label explaining which it is       | Transparent. Builds trust. Every result has a number.   | Requires users to understand the distinction.                                      |
| **D. Status quo + better empty state** — Keep "Price unavailable" but explain _why_ and show the insured rate more prominently | Minimal code change. Honest about gaps.                 | Still feels broken when half the results are "unavailable."                        |

### 4.3 Sorting and Ranking Implications

The current default sort is by cash price ascending. With 52% of results having null cash prices, these get pushed to the bottom (sorted as infinity). This means:

- The top results are always from hospitals that publish cash prices (biased toward HCA, for-profit systems)
- Academic medical centers and safety-net hospitals get buried even if their insured rates are lower
- Users see a misleading picture of the market

Any display strategy must address sorting — likely falling back to `avg_negotiated_rate` when `cash_price` is null for ranking purposes.

---

## 5. The Expansion Path

Each row in this table represents data we already have access to but haven't imported yet. The funnel can be widened at any phase.

| Phase       | What It Adds                                 | Additional Rows | Cumulative |
| ----------- | -------------------------------------------- | --------------: | ---------- |
| Current MVP | 1,002 codes, aggregated payer stats          |           13.1M | 13.1M      |
| Phase 6     | All outpatient codes (120K CPT + 109K HCPCS) |           +210M | ~223M      |
| Phase 7     | Inpatient pricing (MS-DRG)                   |            +51M | ~274M      |
| Phase 8     | Payer-specific detail rows                   |           +6.4B | ~6.7B      |

**On price gaps specifically**: Expanding codes (Phase 6) won't fix the cash_price null rate — that's a per-hospital MRF quality issue, not a per-code issue. The same hospitals that don't publish cash prices for CPT 22551 don't publish them for any code.

What _would_ improve cash price coverage:

- **Phase 6+ (MRF crawler)**: Crawling MRFs directly instead of relying on Trilliant's parser may capture cash prices that Trilliant missed due to schema variation
- **External data sources**: State all-payer claims databases, crowdsourced pricing, partnership data
- **Time**: CMS enforcement is increasing. Cash price compliance will likely improve over the next 1-2 years

---

## 6. Summary Statistics for Quick Reference

```
┌──────────────────────────────────────────────────────┐
│                   BY THE NUMBERS                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Source universe:    274M charges · 6.4B payer rows   │
│  After filtering:   13.1M charges (4.8% of source)   │
│  In Supabase:       13,115,268 charges               │
│  Providers:         5,419 (99.8% geocoded)           │
│                                                      │
│  Price coverage of those 13.1M charges:              │
│  ┌────────────────────────────────────────────────┐  │
│  │  Has cash price:        ~6.3M (48%)            │  │
│  │  Has insured rate only: ~6.8M (52%)            │  │
│  │  Has no price at all:   ~0    (0%)             │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Effective coverage:                                 │
│  └─ 100% of charges have SOME price signal           │
│  └─ 48% have the cash price we want to lead with     │
│  └─ 52% require fallback to insured rate or "N/A"    │
│                                                      │
│  Unused data available for expansion:                │
│  └─ 261M more charge rows (more codes)               │
│  └─ 6.4B payer detail rows (per-plan pricing)        │
│  └─ 620 hospitals with incomplete MRF data            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Appendix: Column Coverage Detail

Sampled 3,500 charges across 7 evenly-distributed offsets in the charges table (offsets 0, 50K, 200K, 500K, 1M, 5M, 10M).

| Column                | Non-null | Null   | Coverage                                  |
| --------------------- | -------- | ------ | ----------------------------------------- |
| `cash_price`          | ~48%     | ~52%   | Primary cash price — half the dataset     |
| `gross_charge`        | ~48%     | ~52%   | Tracks almost identically with cash_price |
| `avg_negotiated_rate` | ~81%     | ~19%   | Best overall coverage                     |
| `min_negotiated_rate` | ~81%     | ~19%   | Tracks with avg                           |
| `max_negotiated_rate` | ~81%     | ~19%   | Tracks with avg                           |
| `min_price`           | ~48%     | ~52%   | Tracks with cash_price                    |
| `max_price`           | ~48%     | ~52%   | Tracks with cash_price                    |
| `payer_count`         | ~81%     | ~19%   | Tracks with negotiated rates              |
| `description`         | ~99%+    | <1%    | Almost always present                     |
| `cpt`                 | varies   | varies | Many hospitals use hcpcs instead          |
| `setting`             | ~99%+    | <1%    | Mostly "outpatient"                       |
