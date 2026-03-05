# Unfixable Providers — Geography Remediation

_Generated: 2026-03-03_
_Relates to: Geography remediation (fix-provider-geography.ts, fix-provider-geo-followup.ts)_

## Context

After running the full geography remediation pipeline (3-tier geocoding cascade + state correction + reverse geocode), **10 providers** remain without geographic data. These are truly unfixable via automated means — their Oria source data has garbage addresses (`[]`, `TBD`, empty) and no city field to fall back on.

## Impact

- **10 of 5,419 providers** (0.18%) have no lat/lng and are invisible to PostGIS search
- **Only 1 provider (Baxter Health) has charges** — 26 rows
- The other 9 have 0 charges in Supabase, meaning they contribute no pricing data regardless of location
- **Total charge rows invisible: 26** out of 13,115,268 (0.0002%)

## The 10 Unfixable Providers

| Name                                           | State | Address | City | Charges | Why Unfixable                |
| ---------------------------------------------- | ----- | ------- | ---- | ------: | ---------------------------- |
| UAB St. Vincent's East                         | AL    | `[]`    | —    |       0 | Garbage address, no city     |
| UAB St. Vincent's Chilton                      | AL    | `[]`    | —    |       0 | Garbage address, no city     |
| UAB St. Vincent's Blount                       | AL    | `[]`    | —    |       0 | Garbage address, no city     |
| Warren Medical Group                           | CO    | `TBD`   | —    |       0 | Placeholder address, no city |
| Baxter Health                                  | CO    | `TBD`   | —    |      26 | Placeholder address, no city |
| John H. Stroger Jr. Hospital                   | IL    | `[]`    | —    |       0 | Garbage address, no city     |
| Provident Hospital Cook County                 | IL    | `[]`    | —    |       0 | Garbage address, no city     |
| Easton Avenue                                  | NJ    | `[]`    | —    |       0 | Garbage address, no city     |
| Coquille Valley Hospital                       | OR    | `[]`    | —    |       0 | Garbage address, no city     |
| Medical Behavioral Hospital of Clear Lake, LLC | TX    | `[]`    | —    |       0 | Garbage address, no city     |

## Resolution Options

These could be manually fixed in a future pass:

1. **Manual lookup**: Google the hospital name + state, get the real address, and UPDATE directly
2. **Wait for Oria data refresh**: Trilliant may improve their source data in future releases
3. **Ignore**: 9 of 10 have zero charges. The one with charges (Baxter Health, 26 rows) is negligible.

## Remediation Summary (for reference)

The full remediation fixed **599 of 609** affected providers:

| Method                                   | Providers Fixed |       Cost |
| ---------------------------------------- | --------------: | ---------: |
| extractZipV2 (regex + state validation)  |             387 |       Free |
| lookupByName (city+state → ZIP centroid) |              28 |       Free |
| Google Maps Geocoding API                |             184 |     ~$0.92 |
| **Total fixed**                          |         **599** | **~$0.92** |

Follow-up pass corrected 45 wrong state fields and 12 placeholder ZIPs (reverse geocode).

**Before → After:**

| Metric                  |        Before |         After |
| ----------------------- | ------------: | ------------: |
| Geocoded providers      | 5,034 (92.9%) | 5,409 (99.8%) |
| Null-location providers |           385 |            10 |
| Wrong-ZIP providers     |           224 |             0 |
| Invalid ZIPs            |             0 |             0 |
| Charges searchable      |        ~11.2M |        ~13.1M |
