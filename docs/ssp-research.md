# SSP Dataset Research — Turquoise Health Standard Service Packages

Research spike for #100. Analyzed 2026-03-12.

## 1. Dataset Overview

**Source:** [Turquoise Health SSP](https://github.com/turquoisehealth/servicepackages.health) (open source, MIT license)
**Methodology:** Co-occurrence analysis from ~2.7B Komodo Health Sentinel claims (30M+ patients) — ~2.2B professional + ~450M institutional claims
**Focus:** Hospital-based outpatient services — procedures with CMS OPPS J1 status indicators (complex, high-cost)
**Size:** 2,948 episode definition files, one CSV per principal procedure
**Freshness:** Static dataset (no ongoing updates indicated). Claims data vintage is pre-2023.

### What SSPs Are

Standard Service Packages wrap all charges and codes across bills for a single encounter into a unified definition. Instead of a patient seeing separate bills for the facility fee, anesthesia, pathology, and drugs, an SSP defines which codes _typically_ appear together when a principal procedure is performed.

SSPs are **encounter-based** (single visit), not episodic (multi-visit). They represent the statistical co-occurrence of billing codes, not prescriptive bundles.

### What SSPs Are NOT

- Not a price database — SSPs define _what_ is billed together, not _what it costs_
- Not prescriptive — they reflect billing patterns, not clinical protocols
- Not episodic — a knee replacement SSP covers the surgery encounter, not the full care episode (pre-op, surgery, rehab)
- Not provider-specific — these are aggregate patterns across all providers

## 2. Schema

### File Structure

One CSV file per principal procedure in `outputs/`:

- Filename: `beta_sorted_{code}.csv` where `{code}` is the principal CPT/HCPCS code
- 2,948 files total

### CSV Schema (4 columns)

| Field          | Type                    | Description                                                                                                                               |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `cpt`          | string                  | Co-occurring code (CPT, HCPCS, revenue code, or C-code)                                                                                   |
| `total_count`  | integer                 | Number of claims where this code appeared alongside the principal                                                                         |
| `association`  | float                   | Frequency ratio: count / total claims with principal. Max 1.0 per claim, but can exceed 1.0 if a code appears multiple times on one claim |
| `resolveFroms` | string (pipe-delimited) | NCCI PTP resolved codes — less-frequent codes merged into this code per CMS edit rules                                                    |

### Entity Relationships

```
Principal Code (filename)
  │
  ├── 1:N → Component Codes (rows)
  │         Each has: code, count, association, resolvedFroms
  │
  └── Component tiers (by association threshold):
        ├── Facility fee:    association >= 0.4
        ├── Optional:        0.3 <= association < 0.4
        ├── Professional:    association >= 0.5
        └── Rare/incidental: association < 0.3 (95.4% of all rows)
```

### Code Systems Present

| Code Type                    | Count (unique) | Examples                                              | Notes                                                     |
| ---------------------------- | -------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Standard CPT (5-digit)       | 3,501          | 27447, 88305, 99152                                   | Procedures, pathology, E/M                                |
| HCPCS Level II               | 189            | J2704 (propofol), G0416 (pathology), Q9963 (contrast) | Drugs, supplies, services                                 |
| Revenue codes (4-digit 0xxx) | 137            | 0636 (pharmacy), 0360 (OR services), 0250 (pharmacy)  | Hospital cost centers — no standalone charges in MRF data |
| C-codes                      | 104            | C1776, C2626                                          | CMS pass-through supplies                                 |
| Category III CPT (####T)     | 69             | 0071T, 0200T                                          | Emerging technology codes                                 |
| Unknown/other                | 19             | Various                                               | Edge cases                                                |

### Key Observations

- **Revenue codes are universal:** 0636 (pharmacy) appears in 2,890/2,948 episodes (98%). These represent hospital cost centers, not separately billable services. They signal _what departments are involved_ but don't have standalone MRF prices.
- **Association > 1.0:** When a code appears multiple times per claim (e.g., multiple pathology specimens), the association exceeds 1.0. Q9963 (contrast media) averages 6.01 association — patients receive ~6 units per encounter.
- **resolveFroms consolidation:** Less-frequent codes are merged into higher-frequency codes via NCCI Procedure-to-Procedure edits. E.g., 88306 resolves into 88305 — they're interchangeable pathology codes. This strengthens the statistical signal.

## 3. Coverage Analysis

### Layer 1: SSP Principal Codes vs ClearCost Code List

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Our codes           | 1,002                                |
| SSP principal codes | 2,948                                |
| **Overlap**         | **120 (12.0% of ours, 4.1% of SSP)** |
| SSP-only            | 2,828                                |
| Our-only            | 882                                  |

**Why low overlap?** The SSP focuses on complex J1-status procedures (surgeries, cardiac caths, interventional radiology). Our code list includes many codes that SSP doesn't define packages for: office visits (99213), imaging reads (73721 MRI), lab tests (80053 CMP), anesthesia codes (00142). These simpler services ARE components of SSP episodes, but they don't have their own SSP definitions.

All 120 overlap codes are standard CPT. No HCPCS overlap (our HCPCS codes like J-codes are component services, not principal procedures in SSP's model).

**Sample overlap codes:** 27447 (knee replacement), 27130 (hip replacement), 19083 (breast biopsy), 19301 (mastectomy), 66984 (cataract surgery), 49505 (hernia repair), 45380 — colonoscopy is NOT in the overlap (no SSP file).

### Layer 2: Component Code Charge Coverage (Supabase)

For the 120 overlap episodes, we extracted all facility-tier (association >= 0.4) component codes and checked Supabase for price data:

| Metric                               | Value           |
| ------------------------------------ | --------------- |
| Unique component codes (all types)   | 295             |
| Billable component codes (CPT/HCPCS) | 232             |
| **Codes with Supabase charges**      | **158 (68.1%)** |
| Missing from Supabase                | 74              |
| **Median per-episode coverage**      | **75.0%**       |
| Episodes with 100% coverage          | 12/120          |
| Episodes with 0% coverage            | 0/120           |

**Per-episode breakdown (selected):**

| Episode                          | Billable Components | Priceable | Coverage | Revenue Codes |
| -------------------------------- | ------------------- | --------- | -------- | ------------- |
| 27447 (knee replacement)         | 16                  | 10        | 63%      | 13            |
| 27130 (hip replacement)          | 13                  | 10        | 77%      | 12            |
| 50543 (laparoscopic nephrectomy) | 15                  | 12        | 80%      | 10            |
| 23472 (shoulder replacement)     | 11                  | 9         | 82%      | 9             |
| 19303 (mastectomy)               | 13                  | 7         | 54%      | 10            |
| 93656 (cardiac ablation)         | 14                  | 7         | 50%      | 10            |

### Layer 3: Gap Analysis

**4,019 unique component codes** appear across all 2,948 SSP episodes (at the facility tier).

**Code list expansion candidates** — CPT/HCPCS codes appearing in 10+ episodes with avg association >= 0.3, that we don't currently carry:

| Code  | Type  | Episodes | Avg Assoc | What It Is                           |
| ----- | ----- | -------- | --------- | ------------------------------------ |
| J2704 | HCPCS | 2,406    | 0.63      | Propofol (anesthesia)                |
| J7120 | HCPCS | 399      | 0.50      | Normal saline (IV fluid)             |
| J1170 | HCPCS | 397      | 0.56      | Hydromorphone (pain)                 |
| 88323 | CPT   | 147      | 1.19      | Pathology consultation               |
| Q9963 | HCPCS | 75       | 6.01      | Contrast media (per mL)              |
| G0416 | HCPCS | 64       | 1.45      | Surgical pathology                   |
| J3490 | HCPCS | 63       | 0.87      | Unclassified drugs                   |
| 88325 | CPT   | 61       | 1.21      | Pathology review                     |
| J0330 | HCPCS | 59       | 0.53      | Succinylcholine (paralytic)          |
| 28297 | CPT   | 52       | 0.96      | Bunionectomy w/ metatarsal osteotomy |
| 99152 | CPT   | 29       | 0.72      | Moderate sedation                    |

Total expansion candidates: **48 codes**. Adding these would improve SSP episode coverage.

**Structural gaps (un-priceable):**

- **137 revenue codes** — hospital cost center identifiers (OR services, pharmacy, recovery). Not separately priced in MRFs.
- **104 C-codes** — CMS pass-through supplies and devices (C1776 = joint prosthesis). Sometimes have MRF prices but inconsistently.
- Revenue code 0636 (pharmacy) appears in 98% of all episodes but has no standalone price — it's an institutional billing artifact.

## 4. Data Model Recommendations

### Proposed `episode_definitions` Table

```sql
create table episode_definitions (
  id uuid primary key default gen_random_uuid(),
  -- Identity
  ssp_code text unique not null,         -- Turquoise SSP identifier (= principal CPT)
  principal_code text not null,          -- Primary procedure code
  principal_code_type text not null,     -- 'cpt', 'hcpcs'
  label text not null,                   -- Human-readable name ("Knee Replacement")
  category text,                         -- Grouping: 'orthopedic', 'cardiac', etc.

  -- Metadata
  source text default 'turquoise_ssp',
  source_claim_count integer,            -- N claims underlying the SSP
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table episode_components (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episode_definitions(id) on delete cascade,

  -- Component identity
  code text not null,
  code_type text not null,               -- 'cpt', 'hcpcs', 'revenue_code'
  tier text not null,                    -- 'required', 'expected', 'optional'
  billing_class text,                    -- 'facility', 'professional'

  -- Statistical weights from SSP
  association float not null,            -- 0.0-1.0+ (frequency ratio)
  charge_weight float,                   -- % of total episode charge
  total_count integer,                   -- Claim count

  -- NCCI resolution
  resolved_from text[],                  -- Codes merged into this one

  constraint uq_episode_component unique (episode_id, code)
);

create index idx_episode_components_episode on episode_components (episode_id);
create index idx_episode_components_code on episode_components (code);
```

### Tier Classification

| Tier       | Association Threshold | Meaning                                  | Example               |
| ---------- | --------------------- | ---------------------------------------- | --------------------- |
| `required` | >= 0.7                | Almost always billed with this procedure | Pathology with biopsy |
| `expected` | 0.4 - 0.7             | Usually billed, but not always           | Anesthesia drugs      |
| `optional` | 0.3 - 0.4             | Sometimes billed                         | Contrast media        |

### Grouping Key Design

SSP episodes map to existing charge lookups via `principal_code`:

```
User searches "knee replacement"
  → Claude translates to CPT 27447
  → Search charges for 27447 (existing flow)
  → ALSO look up episode_definitions WHERE principal_code = '27447'
  → Get all episode_components
  → For each component code, lookup charges at same provider
  → Sum to estimate all-in cost
```

### Component Multiplicity

| Metric          | All components | Facility-tier (assoc >= 0.4) |
| --------------- | -------------- | ---------------------------- |
| Min per episode | 2              | 1                            |
| Median          | 308            | 13                           |
| P75             | 539            | —                            |
| Max             | 2,810          | 464                          |
| Avg             | 407            | 14                           |

The raw component lists are very long (median 308) because they include every code that ever appeared on a claim with the principal. **Only the facility-tier matters for pricing** — median 13 components, which is manageable for per-provider lookups.

### Pricing Composition Feasibility

For the 120 overlapping episodes:

- **Median 75%** of billable component codes have charges in Supabase
- **0 episodes** have zero coverage — every episode has _some_ priceable components
- **12 episodes** (10%) have 100% coverage of their billable components

The main gap is **J-codes** (injectable drugs) and **pathology codes** that aren't in our 1,002-code import list. These codes DO exist in the underlying Trilliant MRF data — we just didn't import them. A targeted import of the 48 expansion candidates would substantially improve episode coverage.

**Revenue codes (137 unique) are un-priceable** — they represent hospital cost centers (OR, pharmacy, recovery room). They're valuable as metadata (tells you which departments are involved) but don't have standalone charges. This is a structural ceiling: even with perfect CPT/HCPCS coverage, revenue code costs are baked into facility fees.

## 5. Feasibility Assessment

### What % of Episodes Can We Price?

| Scope                       | Coverage                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| Any partial estimate        | **100%** — all 120 overlap episodes have at least some priceable components |
| ≥50% of billable components | ~85% of episodes                                                            |
| ≥75% of billable components | ~50% of episodes                                                            |
| 100% of billable components | 10% of episodes                                                             |

### Structural Ceiling

Even with a complete code list, **revenue codes create an inherent gap**. Hospital MRFs don't publish separate prices for "OR services" (0360) or "pharmacy" (0636) — these costs are embedded in the facility fee for the procedure itself.

This means the SSP approach gives us a **useful directional estimate** ("your knee replacement will involve facility, anesthesia, pathology, and drugs — here's what each costs") rather than a precise all-in total. The value is in **decomposing the bill** and flagging expected additional charges, not in summing to a guaranteed total.

### Accuracy Considerations

1. **Association != certainty:** A code with 0.6 association appears on 60% of claims. We're estimating what a _typical_ encounter looks like, not a specific patient's bill.
2. **Provider variation:** Different hospitals bill different code combinations. The SSP is a national average — local patterns may differ.
3. **Temporal lag:** Claims data is pre-2023. New drugs, techniques, or billing practices may shift patterns.
4. **Professional fees:** Many component codes (especially with high association) are professional fees billed by independent physicians (anesthesiologists, pathologists). Hospital MRFs may not include these. This is the biggest accuracy risk.

## 6. Code List Implications

### Should We Expand?

**Yes, but targeted.** Adding all 2,828 SSP-only principal codes would bloat our import from 8M to potentially 100M+ rows with diminishing returns. Instead:

**Recommended strategy:**

1. **Add the 48 expansion candidates** (J-codes, pathology, sedation) to `final-codes.json` → targeted import → immediately improves episode coverage for existing overlap episodes
2. **Prioritize high-value SSP principal codes** that users actually search for but we don't carry (e.g., complex cardiac procedures, neurosurgery). Cross-reference with search analytics once we have them.
3. **Don't import revenue codes or C-codes** — they don't have useful standalone prices

### Import Impact

Adding 48 codes at ~8K rows/code (national average) = ~384K additional charge rows. Trivial relative to our current 8.15M rows.

## 7. Next Steps

### For #63 (Episode Cost Estimation — Near Term)

1. Create `episode_definitions` and `episode_components` tables per schema above
2. Import the 120 overlapping SSP episodes (parse CSV → insert)
3. Build "episode cost composition" API: given a procedure code + provider, look up the episode definition and sum available component charges from that provider
4. Display as "estimated all-in cost" with breakdown on results page
5. Add the 48 expansion candidate codes to the import list and run a targeted import

### For #92 (Full SSP Integration — Medium Term)

1. Import all 2,948 SSP episodes into `episode_definitions`
2. Build episode search: let users find episodes by name/category, not just individual codes
3. Cross-reference SSP principal codes against search analytics to prioritize which episodes to surface
4. Consider adding `charge_weight` data (percentage of total claim charge per component) for weighted estimates when exact charges aren't available

### Future Considerations

- **Professional fee estimation:** Hospital MRFs don't include independent physician charges. For accurate all-in estimates, we'd need either physician MRF data (Phase 8+) or statistical models based on Medicare fee schedules.
- **Episode chaining:** Turquoise notes SSPs are encounter-based, not episodic. A knee replacement _episode of care_ = pre-op testing SSP + surgery SSP + rehab SSP. Building multi-SSP episodes is a future differentiation opportunity.
- **Provider-specific patterns:** Eventually, we could build provider-specific SSP variants using our own MRF data — "Hospital X typically bills these codes with knee replacements" vs national average.
