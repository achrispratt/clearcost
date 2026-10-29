# Pricing rules and verification

The headline compares one fee scope and one price basis. It does not mix cash prices, average negotiated rates and constructed visit estimates into one range. Other available rows remain in the list with their own labels.

## Comparison policy

- Choose the most represented explicit hospital-side scope (facility or both); ties prefer facility. If neither exists, use explicitly professional fees, then unspecified coverage.
- Within that scope, prefer published cash, then estimates from cash, then published negotiated averages, then estimates from negotiated averages.
- Unknown billing class means unknown coverage, never a complete price. Provider grouping prefers explicitly labeled rows over unspecified ones.
- For inpatient comparisons, first select the existing typical DRG, then compare the same price basis. The hospital-stay price still excludes separately billed doctors.
- List prices never set the headline. Constructed visit estimates never populate `cashPrice`; the `encounterEstimate` object records basis, coverage and whether the source is the hospital or a nearby fallback.
- Visit estimates borrowed from nearby hospitals remain visible for context but never set a hospital's headline range or lowest-price label. If only borrowed estimates exist, no headline comparison is shown.
- The visit builder uses the shared displayed cash/negotiated price, not raw negotiated minima. A discarded placeholder cannot return through `minPrice`.
- Optional adders produce a total only when fee scope and payment basis match and all prices belong to that hospital. An unknown scope or nearby fallback is not silently summed into a hospital total.
- SSP episode estimates remain separate, labeled hospital or doctor components with missing-part and conversion notes. A missing total is not replaced by a cheap single fee in estimated-total sorting.

## Saved searches

New saves include a version-1 resolved context: codes and their types/descriptions, interpretation, pricing plan, side and body site. Reopening restores those selections but fetches current prices; it is not a historical price quote. Server validation bounds the payload and rejects invalid context. Existing saves use their stored codes where possible. A legacy save without coordinates returns to the homepage rather than silently searching New York.

Apply the additive `*_saved_search_context.sql` migration **before** deploying the application changes. It adds a nullable JSONB column; existing owner-scoped RLS policies remain in force. No price data is rewritten. Deployment without this migration causes new context-bearing saves to fail rather than quietly discard their context.

## Verification

- `__tests__/unit/encounter-pricing.test.ts` exercises the actual price lookup and encounter construction, mocking only database access: placeholder rejection, negotiated provenance, medians of cash rows, and list-only rows.
- Summary tests check that cash/insured and facility/complete/unknown prices do not share a headline.
- Saved-search tests cover context serialization and API storage, invalid input and authentication.
- Existing live price evaluations compare against a committed SEO index. They detect regression, not independent accuracy. Rebuild and review the SEO index after changing comparison policy; fewer like-for-like prices can correctly cause a page to fall below its publishing threshold.

## October 29 release verification

- Production has the saved-search context and explicit Data API grants migrations. Existing archive migrations from PRs #229 and #230 are included from current main.
- A temporary preview account completed sign in, save, saved-list reopen and context restoration for code `73721`, right knee and the pricing plan. Reopening made no clarification calls. The account and saved row were deleted afterward.
- The SEO index was rebuilt from all 2,660 procedure/city lookups: 1,431 pages qualify, versus 2,246 in the October 23 index. The 815 removals keep the index aligned with the existing three-comparable-price publishing threshold. Data has also changed since the old snapshot; the total difference is not attributed solely to this PR.
- Same-data spot checks explain the policy effect: Indianapolis knee MRI has 12 entries under the previous policy and two matching hospital-fee cash prices under this policy; Phoenix colonoscopy has 19 and one respectively. Other prices remain available through search. New York knee MRI retains 23 comparable entries and remains publishable.

## Work still requiring external evidence

1. Independently review representative referral/code/variant scenarios, including inpatient mapping and symptom-to-visit behavior.
2. Compare selected prices and fee inclusions with written provider estimates.
3. Validate SSP component assumptions and cash conversions against complete episodes, not only the same MRF dataset.
4. Measure confirmed quotes, scheduling and patient outcomes. Clicks and saves alone do not establish savings.
5. Complete a repeatable fresh-database reset check. The migration history is the setup authority; `schema.sql` is a partial reference and does not yet include every crawler/operational table.

No clinical/coding validation or provider quote confirmation is claimed by these software tests.
