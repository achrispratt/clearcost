# ClearCost current implementation

Reviewed against main `8e25076` and the pricing-correctness change on October 25, 2026. This is an implementation map, not evidence of clinical validation, market traction or current national data coverage.

## Product

A consumer describes a service, narrows variants through guided questions and compares hospital prices nearby. Cash prices, average negotiated rates, constructed visits and SSP episode estimates have different meanings; the application must preserve those distinctions. Hospital data alone does not establish a complete patient bill or a guaranteed bookable price.

## Implemented

| Subsystem      | Current behavior                                                                                                                                               | Main code                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Interpretation | Model-backed coding and guided questions; laterality/body-site filters; bounded query/turn inputs                                                              | `lib/cpt/translate.ts`, `prompts.ts`, `pricing-plan.ts`  |
| KB             | Synonyms and conversation nodes; first-write-wins; daily session stats, flagging and archived replacement of flagged resolutions                               | `lib/kb/`, KB growth migration                           |
| Pricing        | PostGIS lookup, retry/chunk fallbacks, expanded geography, description fallback, placeholder and national price bands                                          | `lib/cpt/lookup.ts`, `price-sanity.ts`, `price-bands.ts` |
| Estimates      | Constructed visits; optional adders; SSP component sums with conversion confidence and missing parts; mapped inpatient DRG stays                               | `lib/cpt/episode.ts`, `inpatient-stays.ts`               |
| Results        | Answer cards, hospital rows, map/list selection, filters, CMS stars, phone/directions/website actions                                                          | `app/results/`, `components/results/`                    |
| Accounts       | OAuth and email authentication, owner-scoped saved searches; versioned resolved context in new saves                                                           | `app/auth/`, `app/api/saved/`                            |
| Acquisition    | Procedure/city pages qualified by data coverage, on-demand daily revalidation, sitemap and structured data                                                     | `app/prices/`, `lib/seo/`                                |
| Demand capture | Consent-based email capture for unpriced services                                                                                                              | `app/api/waitlist/`                                      |
| Data           | Oria import, per-hospital lineage, per-diem exclusion, duplicate/overlap protection; independent CMS-template JSON/CSV crawler with staged transactional swaps | `lib/data/`, `lib/crawler/`, `scripts/crawl-mrf.ts`      |
| Operations     | CI checks/build, live Playwright checks, before/after data snapshots, scheduled reference/quality/KB jobs                                                      | `.github/workflows/`, `lib/data-checks/`, migrations     |
| Telemetry      | PostHog and Sentry integration; inactive unless their deployment keys are set                                                                                  | `lib/analytics.ts`, instrumentation files                |

## Important limits

- Hospital-file prices are not confirmed patient quotes. Plan-specific insurance and personal out-of-pocket calculations are not implemented.
- A hospital-wide cash conversion ratio is an estimation heuristic, not a verified discount for a specific service.
- The crawler has no complete automated incremental refresh program; URL matching, bot protection, formula-only rates and missing providers remain limitations.
- The full coverage ledger was paused for database IO constraints. Before/after checks and sliced quality counts have different purposes and do not prove universal completeness.
- Shared numeric price lines are still grouped heuristically; exact source-file identity and service availability at each campus need stronger evidence.
- KB bounce-based re-evaluation is a quality signal, not proof of coding correctness. Runtime model-output validation and explicit model/prompt cache-version policies remain improvements.
- Rate-limit counters are per process. A shared/global spend limiter and separate server geocoding key remain operational improvements.
- Email notification capture is implemented; automated price-availability fulfillment is not.
- Booking, payment, referral attribution and a validated revenue model are not implemented.
- Analytics/error tracking being wired does not prove production keys, dashboards or alert ownership are configured.

## Documentation and setup

The March PRD, GTM plan, data snapshot and historical implementation plans describe their dates, not today's complete state. Reconcile them before making business claims. The tracked migration history is authoritative for database setup; `schema.sql` is a partial reference. A fresh-database reset should be independently exercised before claiming setup reproducibility.

See [pricing rules and verification](./pricing-correctness.md) for the comparison policy, saved-search migration order and the boundary between software tests and independent price validation.
