# Inpatient Codes Removed from Curated List

_Generated: 2026-03-02T20:36:42.799Z_
_Closes [#28](https://github.com/achrispratt/clearcost/issues/28)_

## Methodology

Queried the Trilliant Oria DuckDB warehouse (~81GB Parquet) for the setting distribution
of all 1,010 curated codes in `final-codes.json`. Each code was classified as:

| Classification | Rule | Action |
|---------------|------|--------|
| **REMOVE** | Known inpatient family, OR >90% inpatient, OR MS-DRG + >50% inpatient, OR 100% cash-null + >50% inpatient | Removed from final-codes.json |
| **REVIEW** | >70% inpatient, OR >95% cash-null (100+ rows) | Manually reviewed, then removed or kept |
| **LOW_DATA** | <10 rows in warehouse | Kept (insufficient data to judge) |
| **KEEP** | Everything else | No change |

## Root Cause

The import filter used `LOWER(setting) != 'inpatient'` which missed values like `'InPatient '`
(trailing space). Fixed in this PR by adding `TRIM()` to both `import-trilliant.ts` and `generate-snapshot.ts`.

## Codes Removed (8)

| Code | Description | Total Rows | Inpatient % | Reason |
|------|-------------|----------:|------------:|--------|
| 99221 | INITIAL HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND STRAIGHTFORWARD OR LOW LEVEL MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 40 MINUTES MUST BE MET OR EXCEEDED. | 6,484 | 6.6% | Known inpatient: Initial Hospital Care (low complexity) |
| 99222 | INITIAL HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND MODERATE LEVEL OF MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 55 MINUTES MUST BE MET OR EXCEEDED. | 6,236 | 6.7% | Known inpatient: Initial Hospital Care (moderate complexity) |
| 99223 | INITIAL HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND HIGH LEVEL OF MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 75 MINUTES MUST BE MET OR EXCEEDED. | 6,143 | 6.6% | Known inpatient: Initial Hospital Care (high complexity) |
| 99231 | SUBSEQUENT HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND STRAIGHTFORWARD OR LOW LEVEL OF MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 25 MINUTES MUST BE MET OR EXCEEDED. | 4,736 | 7.7% | Known inpatient: Subsequent Hospital Care (low complexity) |
| 99232 | SUBSEQUENT HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND MODERATE LEVEL OF MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 35 MINUTES MUST BE MET OR EXCEEDED. | 4,782 | 7.7% | Known inpatient: Subsequent Hospital Care (moderate complexity) |
| 99233 | SUBSEQUENT HOSPITAL INPATIENT OR OBSERVATION CARE, PER DAY, FOR THE EVALUATION AND MANAGEMENT OF A PATIENT, WHICH REQUIRES A MEDICALLY APPROPRIATE HISTORY AND/OR EXAMINATION AND HIGH LEVEL OF MEDICAL DECISION MAKING. WHEN USING TOTAL TIME ON THE DATE OF THE ENCOUNTER FOR CODE SELECTION, 50 MINUTES MUST BE MET OR EXCEEDED. | 4,601 | 7.9% | Known inpatient: Subsequent Hospital Care (high complexity) |
| 99238 | HOSPITAL INPATIENT OR OBSERVATION DISCHARGE DAY MANAGEMENT; 30 MINUTES OR LESS ON THE DATE OF THE ENCOUNTER | 4,238 | 8.9% | Known inpatient: Hospital Discharge Day Management (≤30 min) |
| 99239 | HOSPITAL INPATIENT OR OBSERVATION DISCHARGE DAY MANAGEMENT; MORE THAN 30 MINUTES ON THE DATE OF THE ENCOUNTER | 4,038 | 9.0% | Known inpatient: Hospital Discharge Day Management (>30 min) |

## Codes Reviewed (2)

These codes were flagged for manual review. Disposition noted in the Reason column.

| Code | Description | Total Rows | Inpatient % | Reason |
|------|-------------|----------:|------------:|--------|
| 58974 | Embryo transfer, intrauterine  | 6,487 | 1.6% | 96.9% cash-null (6487 rows) |
| 81542 | Oncology (prostate), mRNA, microarray gene expression profiling of 22 content genes, utilizing formalin-fixed paraffin-embedded tissue, algorithm reported as metastasis risk score  | 5,149 | 4.5% | 95.8% cash-null (5149 rows) |

## Impact

- **Codes removed**: 8 (from 1010 → 1002)
- **Database**: No changes needed — only affects curated code list and future imports
- **Search quality**: Consumers will no longer see inpatient-only procedures in results
