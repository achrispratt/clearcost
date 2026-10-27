# Preview database and search checks

Supabase PR branches rebuild the schema from migrations and start without production rows. A green migration or deployment does not establish that search has data to return.

## Review dataset

`supabase/config.toml` enables `supabase/seed.sql`. The seed contains a small October 27, 2026 snapshot read through the public anonymous pricing API: six hospitals near ZIP **07086** (Weehawken, NJ), 15 published charge rows, and the matching price-band and Medicare references. It covers available knee MRI variants (`73721`, `73722`, `73723`) and office-visit rows (`99213`, `99214`); not every hospital publishes every code.

This is a bounded review fixture, not national coverage or a current provider quote. Other searches or metros can correctly return no rows in a preview. No accounts, saved searches, emails, or KB event/history data are copied. Guided search builds its own cache in the isolated branch.

The seed skips any database that already contains providers or charges. Running it again cannot add stale fixture rows to an existing production dataset. Keep fixture data in the seed, never in a production migration.

## Permissions

New Supabase projects can disable automatic table exposure. RLS policies alone do not give `anon`, `authenticated`, or `service_role` table access. The `explicit_data_api_grants` migration grants public reference reads, owner-scoped save operations, and the server's KB/notification operations explicitly. It leaves RLS enabled and does not make KB or saved-search data public.

`supabase/tests/data_api_access.test.sql` exercises these privileges with pgTAP, including denied public writes and private-table reads. Run `supabase test db --local` against a running local Supabase instance, or use a PostgreSQL test connection with pgTAP installed.

## Before calling a preview ready

1. Confirm the deployed app points to the PR's Supabase branch, not production.
2. Confirm seed data exists and the permission tests pass. Supabase's GitHub integration runs migration and seed steps for ephemeral branches; inspect their logs if seeding was skipped.
3. Search for **knee MRI near 07086** through guided search, select the knee and contrast variant, and confirm hospital cards and a price answer render.
4. Test a direct-code search for `73721` at latitude `40.7681`, longitude `-74.0208`. This isolates database lookup from interpretation.
5. Check signed-out saving, and sign in with a preview test account to verify save/reopen. No production account or saved-search data is seeded.

For protected previews, use existing Vercel authentication (`vercel curl`) or your browser session. Never change the app's database URL to production merely to make a preview return data.
