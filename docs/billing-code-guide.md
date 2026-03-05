# Billing Code Guide

Developer/AI reference for working with medical billing codes in ClearCost.
**Audience:** Anyone modifying the search pipeline, translation logic, data import, or results display.

---

## 1. Code Systems

### 1.1 CPT (Current Procedural Terminology)

CPT codes are the primary search target in ClearCost. They are five-digit codes maintained by the AMA, organized into three categories:

- **Category I** (what ClearCost uses): Established procedures. Six sections by first digit — 0xxxx/9xxxx: Evaluation & Management, 1xxxx-6xxxx: Surgery, 7xxxx: Radiology, 8xxxx: Pathology/Lab, 9xxxx: Medicine.
- **Category II** (not used): Supplemental tracking codes (format: 4 digits + `F`). Performance measurement only, not billed.
- **Category III** (not used): Temporary codes for emerging tech (format: 4 digits + `T`). May graduate to Category I.

**Code specificity varies by section — NOT all codes are broad categories.**

Our earlier assumption that "CPT codes are categories, not procedures" is **partially correct but overstated**. The pattern depends on the code section:

```
CPT Code Specificity Spectrum
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BROAD (multi-site/multi-use)              SPECIFIC (1:1 procedure)
│                                                  │
├─ 73721 MRI any lower extremity joint      ├─ 27447 Total knee replacement
├─ 99213 Office visit L3 (any complaint)    ├─ 43239 Upper GI endoscopy w/biopsy
├─ 99283 ED visit L3 (any presentation)     ├─ 70553 MRI brain w/ and w/o contrast
│                                                  │
Radiology & E/M codes tend to be broader    Surgical codes tend to be very specific
(grouped by region + modality + contrast)   (different codes per anatomical site,
                                            approach, and complexity)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**What this means for ClearCost:**
- **Broad imaging codes** (like 73721): Hospitals price different body sites differently under the same code. Multiple rows per provider+code represent different body sites — this is expected, not a data quality issue.
- **Specific surgical codes** (like 27447): Multiple rows per provider+code more likely indicate different billing classes (facility vs professional) or different payer-negotiated rates, not different body sites.
- **E/M codes** (99xxx): Grouped by visit type and complexity, not anatomy. One code covers any complaint at that complexity level.

**AMA copyright notice:** CPT codes and their official descriptions are copyrighted by the AMA. Any electronic product displaying CPT descriptions requires an AMA Distribution License (~$1,050+/year). ClearCost's current descriptions come from hospital MRFs (hospital-authored), not AMA descriptions. The code _numbers_ themselves appear in public CMS/HIPAA data. See §7.2 for details.

ClearCost uses 1,002 curated CPT/HCPCS codes stored in `lib/data/final-codes.json` (a flat `string[]`). Sources: CMS 70 (mandatory shoppable) + CMS Top 200 (highest volume) + Top 500 (coverage %) + FAIR Health 300+ (consumer-oriented).

### 1.2 HCPCS (Healthcare Common Procedure Coding System)

HCPCS is the umbrella system — CPT lives inside it:

```
┌─────────────────────────────────────────────┐
│              HCPCS (CMS-maintained)          │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Level I = CPT (AMA-maintained)        │  │
│  │  5 numeric digits: 00100-99499         │  │
│  │  Procedures, services, E&M visits      │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Level II (CMS-maintained)             │  │
│  │  1 alpha + 4 numeric: A0000-V9999      │  │
│  │  Supplies, drugs, DME, transport,      │  │
│  │  services not covered by CPT           │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

Common Level II prefixes: **A** = transport/supplies, **E** = durable medical equipment, **G** = temporary CMS services, **J** = injectable drugs, **P** = pathology, **Q** = temporary/misc.

Of the 1,002 curated codes, ~46 are HCPCS Level II (alpha-prefixed). The remaining ~956 numeric codes are CPT.

**The cross-column problem:** Since CPT IS HCPCS Level I, a hospital listing code `73721` under "HCPCS" is technically correct. The CMS MRF data dictionary uses `code | type` where `CPT` and `HCPCS` are separate valid values — creating ambiguity since CPT is a subset of HCPCS. ~1,800 hospitals use the HCPCS column for CPT-range codes. The search RPC handles this:

```sql
-- From search_charges_nearby() in supabase/schema.sql
(p_code_type = 'cpt' and (c.cpt = any(p_codes) or c.hcpcs = any(p_codes)))
```

When searching for CPT codes, the RPC checks BOTH columns. This cross-column search is essential — without it, we'd miss ~1,800 hospitals' data entirely.

**Code paths involved:**
- Import: `lib/data/import-trilliant.ts` (filters `WHERE cpt IN (...) OR hcpcs IN (...)`)
- Search RPC: `supabase/schema.sql` (cross-column WHERE clause)
- Migration: `scripts/migrate-cross-column-search.ts`

### 1.3 MS-DRG (Medicare Severity Diagnosis Related Group)

MS-DRG codes represent bundled inpatient hospital stays — the entire admission priced as one unit. They're fundamentally different from CPT/HCPCS, which price individual procedures.

**Excluded from MVP.** The `charges` table has an `ms_drg` column but it's unused in current data. Eight inpatient E/M codes were removed from the curated list (99221-99223, 99231-99233, 99238-99239). See `docs/inpatient-codes-removed.md` for the classification methodology.

**Future:** Phase 7 will add all inpatient pricing (~50.8M additional rows).

### 1.4 Modifiers

Modifiers are suffixes that alter how a billing code is interpreted. Stored in the `modifiers` column as comma-separated text.

**Laterality modifiers (fully implemented):**

| Modifier | Meaning   | Example                       |
| -------- | --------- | ----------------------------- |
| LT       | Left      | 73721-LT = left knee MRI     |
| RT       | Right     | 73721-RT = right knee MRI    |
| 50       | Bilateral | 73721-50 = both knees MRI    |

CMS rules: LT and RT are mutually exclusive with 50 (never combined). CMS rejects claims missing laterality modifiers when applicable — they're treated as duplicate claims without them. Both knees = either two line items with LT and RT, OR one item with modifier 50.

Laterality is parsed during import via `parseLaterality()` in `lib/cpt/parse-laterality.ts` with this priority chain:

```
Priority 1: Modifiers field (highest reliability)
  └─ \b50\b → bilateral, \bLT\b → left, \bRT\b → right

Priority 2: Description suffix abbreviations (word-boundary)
  └─ \bLT\b → left, \bRT\b → right
  └─ No \bBI\b — too many false positives (BI-RADS, BI-V, etc.)

Priority 3: Description full words
  └─ BILATERAL/BILAT → bilateral, LEFT → left, RIGHT → right

Priority 4: No match → null
```

A SQL mirror function (`parse_laterality()` in `supabase/schema.sql`) replicates this logic for in-database backfill. The search RPC accepts an optional `p_laterality` parameter to filter results. Issue #51 tracks frontend integration.

**Component modifiers (not implemented, but important context):**

| Modifier | Meaning                     | Approximate `billing_class` equivalent |
| -------- | --------------------------- | -------------------------------------- |
| 26       | Professional component only | `billing_class = 'professional'`       |
| TC       | Technical component only    | `billing_class = 'facility'`           |
| (none)   | Global (both components)    | `billing_class = 'Both'` or null       |

These are **conceptually related but technically separate systems**:

```
┌──────────────────────────────────────────────────────────┐
│  billing_class (MRF field)    ←  describes the charge ROW│
│  "professional" / "facility" / "both"                    │
│  Optional. Many hospitals leave blank.                   │
├──────────────────────────────────────────────────────────┤
│  Modifiers 26/TC (claim field) ← describes a LINE ITEM  │
│  26 = professional, TC = technical, none = global        │
│  Usually NOT in MRF data (lives on claims, not charges)  │
└──────────────────────────────────────────────────────────┘
```

Don't assume a 1:1 mapping. A hospital that only bills facility fees (because physicians bill independently) might not use TC — the absence of modifier 26 implicitly means it's the facility component.

**Other common modifiers** (not parsed, but present in data):

| Modifier | Meaning                              | Pricing relevance                          |
| -------- | ------------------------------------ | ------------------------------------------ |
| 59       | Distinct procedural service          | Affects whether both charges get paid       |
| XE/XS/XP/XU | Specific versions of 59          | CMS prefers these since 2015               |
| 76       | Repeat procedure, same physician     | Same procedure again same day              |
| 51       | Multiple procedures                  | Payment may be reduced for 2nd+ procedures |
| 25       | Significant separate E&M             | Office visit + procedure same day          |

Only laterality modifiers are extracted into a dedicated column.

---

## 2. Charge Anatomy

### 2.1 What a Charge Row Represents

Each row in the `charges` table is one line item from a hospital's MRF: a single price for a specific billing code at a specific provider, with a specific billing class and description.

Key columns:

| Column               | Type    | What it means                                          |
| -------------------- | ------- | ------------------------------------------------------ |
| `cpt`                | text    | CPT code (may be null if hospital used HCPCS column)   |
| `hcpcs`              | text    | HCPCS code (may contain CPT-range codes)               |
| `ms_drg`             | text    | MS-DRG code (unused in current data)                   |
| `description`        | text    | Hospital's own description of the service              |
| `billing_class`      | text    | "facility", "professional", "Both", or null            |
| `setting`            | text    | "inpatient", "outpatient", "both" (current data is outpatient) |
| `laterality`         | text    | "left", "right", "bilateral", or null (parsed)         |
| `modifiers`          | text    | Raw modifier codes, comma-separated                    |
| `cash_price`         | numeric | Self-pay/uninsured price                               |
| `gross_charge`       | numeric | Hospital's list/"sticker" price (nobody pays this)     |
| `min_price`          | numeric | De-identified minimum rate                             |
| `max_price`          | numeric | De-identified maximum rate                             |
| `avg_negotiated_rate`| numeric | Average of what insurers negotiated (pre-aggregated)   |
| `min_negotiated_rate`| numeric | Lowest insurer rate (anonymized)                       |
| `max_negotiated_rate`| numeric | Highest insurer rate (anonymized)                      |
| `payer_count`        | integer | Number of payers in the aggregated stats               |

### 2.2 The `billing_class` Field

**This field is optional in the CMS MRF spec** — many hospitals omit it, which is why a large portion of charges have null billing_class. CMS standardized the accepted values as `"professional"`, `"facility"`, and `"both"`, but does not require hospitals to populate it.

This determines what cost component a charge represents:

```
┌───────────────────────────────────────────────────────────────────┐
│                  THE ALL-IN COST BREAKDOWN                        │
│                                                                   │
│   What the patient actually pays:                                 │
│   ┌──────────────────────┐   ┌──────────────────────┐            │
│   │   Facility fee       │ + │  Professional fee     │ = Total   │
│   │   (hospital/equip)   │   │  (doctor's reading)   │           │
│   │   billing_class =    │   │  billing_class =      │           │
│   │   "facility"         │   │  "professional"       │           │
│   └──────────────────────┘   └──────────────────────┘            │
│                                                                   │
│   When billing_class = "Both" or null:                            │
│   ┌──────────────────────────────────────────────┐               │
│   │   Bundled fee (facility + professional)       │ = Total      │
│   │   More complete estimate of actual cost       │              │
│   └──────────────────────────────────────────────┘               │
└───────────────────────────────────────────────────────────────────┘
```

- **"facility"** — Hospital/equipment fee only. Doctor's fee billed separately. Example: MRI facility charge covers the scanner time but NOT the radiologist's reading fee.
- **"professional"** — Doctor's fee only. Hospital fee billed separately. Example: Radiologist's interpretation of an MRI, billed independently.
- **"Both" or null** — Likely a more complete estimate. Treat with higher confidence as representing total cost.

### 2.3 Multiple Rows Per Provider + Code

A hospital having 5-50+ rows for a single CPT code is **normal behavior**, not a data quality issue. Causes:

1. **Different body sites** — CPT 73721 covers any lower extremity joint. A hospital may price knee, hip, and ankle MRIs separately under the same code.
2. **Different billing classes** — Separate facility and professional fee rows for the same procedure.
3. **Different laterality** — Left knee, right knee, bilateral.
4. **Different negotiated rates** — Different payer-aggregated stats when rates vary significantly.
5. **Different descriptions** — Hospital-specific naming conventions for the same procedure.

### 2.4 True Duplicates vs Meaningful Variants

**True duplicates** are byte-for-byte identical rows — same provider, same code, same description, same billing_class, same prices, everything. These are import artifacts and are safe to remove.

**Meaningful variants** are rows that differ in ANY column — even just the description. These represent real pricing distinctions and must be preserved.

**The conservative dedup approach** (Issue #8, `scripts/deduplicate-charges.ts`): Groups by ALL columns (provider_id, cpt, hcpcs, ms_drg, description, billing_class, setting, modifiers, laterality, AND all price columns). Only removes rows identical in every field. Result: 13.1M → 8.36M rows.

**Search-level dedup was ROLLED BACK** (Issue #9). Attempted to merge rows with truncated descriptions — removed ~10% more rows but risked hiding legitimate pricing variants for different body sites or billing classes.

**Philosophy:** ClearCost is a transparency tool. Never hide price data. When in doubt, show more rows with context rather than fewer rows with assumptions.

---

## 3. The All-In Cost Problem

Hospital charges in MRF data represent **components**, not totals. The billing system uses two separate claim forms:

- **UB-04 (CMS-1450)**: Institutional/facility claims. Hospitals use this.
- **CMS-1500**: Professional claims. Physicians use this.

These are separate claims from separate entities. The hospital and the radiologist may have **different contracts** with the same insurer.

```
Patient gets MRI at Hospital
     │
     ├──→ Hospital bills (UB-04):   73721-TC or no modifier
     │    Facility fee: $800        (equipment, tech, room, supplies)
     │
     ├──→ Radiologist bills (CMS-1500): 73721-26
     │    Professional fee: $200    (image reading, diagnostic report)
     │
     └──→ (If applicable) Anesthesiologist bills separately
          Sedation fee: $150        (for claustrophobic patients)
          ─────────────
          Actual cost: ~$1,150      ← NOT what a single MRF row shows
```

**What hospital MRFs contain:** Hospitals MUST include charges for employed physicians (professional charges). They do NOT have to include charges for independent physicians. This means MRF data often shows only the facility component.

**Place of service matters for price comparison:**
- **Hospital outpatient** = usually splits facility + professional → appears more expensive per-row
- **Independent imaging center** = usually bills globally (one price, both components) → appears cheaper
- This is partly a real price difference AND partly an apples-to-oranges comparison

### What ClearCost Shows

ClearCost shows ALL available pricing with contextual callouts:

- **"Both"/null billing_class** → Displayed as a more complete estimate
- **"facility"** → Flagged: "professional fees may apply separately"
- **"professional"** → Flagged: "this is physician fee only; facility charges may be separate"
- **Procedure-aware callouts**: MRI → "radiologist reading fee may apply"; surgery → "anesthesia and surgeon fees may be billed separately"

### Price Fields and CMS Mapping

CMS requires five categories of pricing. Our columns map as follows:

| CMS Requirement                     | Our Column              | Mapping      |
| ----------------------------------- | ----------------------- | ------------ |
| Gross charge (list price)           | `gross_charge`          | Direct match |
| Discounted cash price               | `cash_price`            | Direct match |
| Payer-specific negotiated charge    | `avg_negotiated_rate`   | **Aggregated** — CMS requires per-payer/per-plan rates; we store the pre-aggregated average from Trilliant |
| De-identified minimum negotiated    | `min_negotiated_rate`   | Direct match |
| De-identified maximum negotiated    | `max_negotiated_rate`   | Direct match |

**Label `avg_negotiated_rate` carefully in the UI** — it's a derived average, not a single payer's rate.

**2026 CMS change:** Hospitals must now report median, 10th percentile, and 90th percentile allowed amounts in dollars (replacing percentage-based formulas). This will improve data quality for future imports.

Not every hospital publishes every price type (from `docs/data-funnel-and-price-gaps.md`):

| Field               | Coverage | Notes                                         |
| ------------------- | -------- | --------------------------------------------- |
| `cash_price`        | ~48%     | Self-pay rate — primary display target         |
| `gross_charge`      | ~48%     | Correlates almost identically with cash_price  |
| `avg_negotiated_rate`| ~81%   | Best overall coverage                          |
| `description`       | ~99%+    | Almost always present                          |

When `cash_price` is null, `gross_charge` is also null ~99% of the time. The gap is at the hospital/MRF level (entire hospitals either publish cash prices or don't), not per-procedure.

**Price display hierarchy** (from `lib/cpt/lookup.ts`): `cashPrice > minPrice > avgNegotiatedRate > maxPrice`. Null cash prices are sorted to bottom (treated as Infinity).

---

## 4. Code-to-Search Mapping

How user queries become charge results — the translation and lookup layer.

### 4.1 Multi-Site Codes

When a CPT code covers multiple body sites, the guided search should ask which body part the user needs. The system prompt in `lib/cpt/prompts.ts` includes clinical triage protocols for this:

```
Imaging triage: body part → modality → contrast → laterality → specific joint
```

Example: "knee MRI" → CPT 73721 (covers all lower extremity joints) → guided search may ask "Which joint specifically?" if the query is ambiguous.

### 4.2 Contrast Families

Three imaging code families are hardcoded in `lib/cpt/translate.ts` with without/with/with-and-without contrast variants:

| Family             | Without | With  | With + Without | Trigger regex                  |
| ------------------ | ------- | ----- | -------------- | ------------------------------ |
| Lower extremity MRI| 73721   | 73722 | 73723          | `mri` + knee/hip/ankle/leg/... |
| Brain MRI          | 70551   | 70552 | 70553          | `mri` + brain/head/cranial/... |
| Head CT            | 70450   | 70460 | 70470          | `ct` + head/brain/cranial/...  |

Detection: `detectContrastPreference()` uses regex to find contrast keywords in the user query. Guardrail: `applyContrastGuardrails()` ensures the correct variant is returned even if Claude picks the wrong one.

**Note:** 73722 (lower extremity MRI with contrast) is in the contrast family but is NOT in `final-codes.json`. Most lower extremity MRIs are without contrast, so this code has minimal data.

### 4.3 Encounter-First vs Procedure-First Pricing

The pricing plan system (`lib/cpt/pricing-plan.ts`) determines how results are structured based on query type:

```
┌──────────────────────────────────────────────────────────────────┐
│  Query: "knee MRI"              → procedure_first               │
│  Base codes: 73721              (the procedure IS the result)   │
│                                                                  │
│  Query: "my knee hurts"         → encounter_first               │
│  Base codes: 99202-99215        (office visit codes)            │
│  Adders: MRI, X-ray            (procedures shown as add-ons)   │
│                                                                  │
│  Query: "worst headache of my   → encounter_first (emergency)   │
│          life"                                                   │
│  Base codes: 99281-99285        (ED visit codes)                │
│  Adders: CT, MRI, lab work     (diagnostic procedures)         │
└──────────────────────────────────────────────────────────────────┘
```

Query type is inferred via regex patterns:
- **code**: CPT number detected → `procedure_first`
- **procedure**: Named procedure (e.g., "knee MRI") → `procedure_first`
- **symptom**: Pain/symptom words → `encounter_first` (office or ED)
- **condition**: Named condition (e.g., "broken arm") → `encounter_first`

Emergency red flags (e.g., "worst headache of my life", "severe chest pain") trigger ED visit codes as the base.

### 4.4 Laterality in Search

The `search_charges_nearby()` RPC accepts an optional `p_laterality` parameter:

```sql
and (p_laterality is null or c.laterality = p_laterality)
```

When null (default), all laterality variants are returned. When specified, results are filtered to that side only. Issue #51 tracks integrating laterality selection into the guided search frontend.

---

## 5. Implications for ClearCost

### 5.1 Search

- **Never hide price variants.** Multiple rows per provider+code is expected. Show them with context (billing_class, description, laterality).
- **Cross-column search is required.** Always check both `cpt` and `hcpcs` columns for CPT-type searches.
- **Fallback to description search** when code lookup returns 0 results (via `search_charges_by_description()` RPC with PostgreSQL full-text search).

### 5.2 Guided Search

The AI clarification flow (`/api/clarify`) should ask about:

- **Body site** for multi-site codes (e.g., 73721: which joint?)
- **Laterality** for applicable procedures (left, right, or bilateral?)
- **Contrast** for imaging (without, with, or both?)
- **Diagnostic specificity** for symptoms (walk through what a doctor would ask)

These triage protocols are encoded in `lib/cpt/prompts.ts`.

### 5.3 Results Display

- `billing_class` drives callout text on result cards
- Price hierarchy for sorting: `cashPrice > minPrice > avgNegotiatedRate > maxPrice`
- Null cash prices sorted to bottom
- Default sort: distance first, then price, then provider name

### 5.4 Apples-to-Apples Price Comparison

Meaningful comparison between hospitals requires matching on:

1. **Code** — Same CPT/HCPCS code
2. **Billing class** — Facility-to-facility or professional-to-professional
3. **Body site** — Same body site within multi-site codes
4. **Laterality** — Same side (or both showing bilateral)

Comparing a facility-only MRI fee ($800) to a bundled MRI fee ($1,100) is misleading. ClearCost shows both with context rather than filtering.

---

## 6. Database Quick Reference

**Tables:** `providers`, `charges`, `payer_rates`, `payers`, `saved_searches`

**RPC functions:**

| Function                        | Purpose                                | Key behavior                               |
| ------------------------------- | -------------------------------------- | ------------------------------------------ |
| `search_charges_nearby()`       | Code-based search with PostGIS radius  | Cross-column CPT/HCPCS, optional laterality |
| `search_charges_by_description()`| Full-text fallback on descriptions    | PostgreSQL `ts_rank()` scoring             |

**Key indexes on `charges`:** `cpt`, `hcpcs`, `ms_drg`, `(provider_id, cpt)`, `(cpt, provider_id)`, `(provider_id, hcpcs)`, GIN on description tsvector, laterality (partial where not null).

**TypeScript types** (all in `types/index.ts`): `BillingCodeType`, `ChargeResult`, `Laterality`, `ChargeSetting`, `PricingMode`, `PricingPlan`, `CPTCode`.

Full schema: `supabase/schema.sql`. Project ref: `rzfelzmkdbicrfghofyf`.

---

## 7. Regulatory Landscape

### 7.1 CMS Hospital Price Transparency Rule

ClearCost's data comes from hospital MRFs published under 45 CFR Part 180. Key facts:

- **No restrictions on third-party use.** MRF data is published for public access by federal mandate. No fees, no registration, no barriers. CMS explicitly envisioned "IT firms developing price transparency tools and consumer apps."
- **Compliance is improving but incomplete.** ~35% of hospitals fully compliant (PatientRightsAdvocate.org, 2024). GAO found CMS cannot assure data accuracy. Enforcement is accelerating — penalties up to $2M/year for large hospitals.
- **ClearCost exceeds the shoppable services requirement.** CMS requires hospitals to offer a consumer-friendly display of 300+ shoppable services. ClearCost provides a superior version of this using 1,002 codes from the more comprehensive MRF data.

### 7.2 AMA CPT Copyright

CPT codes and their official descriptions are copyrighted by the AMA. This affects ClearCost:

- **Code numbers** appear in public CMS/HIPAA data — displaying the number `73721` is not restricted.
- **Official AMA descriptions** require a Distribution License (~$1,050+/year base + per-user fees). ClearCost currently displays hospital-authored descriptions from MRFs, which are not AMA-copyrighted.
- **Consumer-friendly descriptions** written by ClearCost (via Claude) are original works, not AMA content.
- **Political context:** The Senate HELP Committee is investigating the AMA's CPT monopoly (~$150M/year in royalties). The landscape may shift toward public domain.

**Pre-launch action:** Get legal counsel on whether current description handling is sufficient or if a Distribution License is needed.

### 7.3 ClearCost as an Informational Tool (Not Medical Practice)

The guided search asks clinical-type questions but its output is **billing code identification for pricing, not a diagnosis or treatment recommendation**. This places it squarely in the "informational tool" category, not "practicing medicine."

```
┌──────────────────────────────────────────────────────────┐
│  SEARCH REFINEMENT TOOL (ClearCost)                      │
│  "Where is the pain?" → identifies billing code →        │
│  "Here are prices for knee MRI (CPT 73721)"              │
│  Output: pricing data                                    │
├──────────────────────────────────────────────────────────┤
│  MEDICAL PRACTICE (diagnosis)                            │
│  "Where is the pain?" → determines condition →           │
│  "You likely have a torn meniscus, you need an MRI"      │
│  Output: diagnosis + treatment recommendation            │
└──────────────────────────────────────────────────────────┘
```

WebMD, Ada Health, and Buoy Health all go further toward diagnosis than ClearCost and operate legally with disclaimers. ClearCost's position is stronger.

### 7.4 Regulations That Apply to ClearCost

| Regulation | Applies? | Impact |
| ---------- | -------- | ------ |
| FTC Section 5 (deceptive practices) | **Yes** | Don't claim prices are "accurate" or "guaranteed." Disclose source and limitations. |
| FTC Health Breach Notification Rule | **Yes** (if storing user search data) | User search queries are "health information" under HBNR. Never share with ad platforms. GoodRx was fined $25M for this. |
| Washington My Health My Data Act | **Yes** (if WA users) | Requires separate consumer health data privacy policy linked from homepage. Covers search queries tied to identifiable users. |
| State AI disclosure laws (CA, CO, UT, TX) | **Yes** | Must disclose AI is used in guided search. "Powered by AI" badge + ToS disclosure. |
| HIPAA | **No** | ClearCost is not a covered entity. MRF data has no patient information. |
| FDA medical device regs | **No** | ClearCost is informational, not clinical decision support. |
| State medical licensing (UPL) | **No** (if properly disclaimed) | Guided search is search refinement, not diagnosis. |

### 7.5 Required Disclaimers (Pre-Launch)

1. **Sitewide footer**: Not medical advice, informational only, consult a provider, emergency → 911
2. **Terms of Service**: No medical advice, no provider-patient relationship, pricing data limitations, AI disclosure, no warranty
3. **Guided search inline**: "These questions help us find the right billing codes. This is not a medical evaluation."
4. **Results page**: "Prices from hospital published rate files. Actual costs depend on insurance, facility/professional fees, and other factors."
5. **Consumer health data privacy policy**: What health-related data is collected, why, who sees it, how to delete. Required by WA MHMDA, good practice nationally.

---

## 8. Glossary

| Term                   | Definition                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| **billing_class**      | What cost component a charge covers: facility fee, professional fee, or both. Optional CMS MRF field. |
| **cash_price**         | Self-pay/uninsured rate published in hospital MRF (CMS: "discounted cash price")             |
| **CMS-1500**           | Professional claim form used by physicians. Separate from UB-04 hospital claims.             |
| **CPT**                | Current Procedural Terminology — AMA-copyrighted codes for outpatient procedures (= HCPCS Level I) |
| **cross-column search**| Checking both `cpt` and `hcpcs` columns because CPT IS HCPCS Level I and hospitals file them inconsistently |
| **global fee**         | A charge that bundles both facility and professional components (no 26/TC modifier)          |
| **gross_charge**       | Hospital's undiscounted list price — nobody actually pays this (CMS: "gross charge")         |
| **HBNR**               | FTC Health Breach Notification Rule — applies to non-HIPAA entities handling health-related data |
| **HCPCS**              | Healthcare Common Procedure Coding System — Level I is CPT, Level II is alpha-prefixed (J, G, etc.) |
| **laterality**         | Left, right, or bilateral — which side of the body. Modifiers: LT, RT, 50                   |
| **modifier**           | Suffix on a billing code that changes its meaning (LT, RT, 50, 26, TC, 59, etc.)            |
| **MRF**                | Machine-Readable File — the standardized price file hospitals must publish under 45 CFR Part 180 |
| **MS-DRG**             | Medicare Severity Diagnosis Related Group — bundled inpatient pricing                        |
| **negotiated rate**    | Price an insurer has agreed to pay a hospital for a service                                   |
| **payer_count**        | Number of insurers included in the pre-aggregated negotiated rate stats                      |
| **revenue code**       | Facility line-item code (e.g., OR time, pharmacy) — too generic for consumer pricing search  |
| **setting**            | Inpatient vs outpatient — current ClearCost data is outpatient only                          |
| **UB-04**              | Institutional claim form used by hospitals/facilities. Separate from CMS-1500 physician claims. |
