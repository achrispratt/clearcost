/**
 * Backfill the body_site column on existing charges using the SQL
 * parse_body_site() function (must be deployed first via migration-body-site.sql).
 *
 * Issue: https://github.com/achrispratt/clearcost/issues/51
 *
 * Prerequisites:
 *   Run migration-body-site.sql in Supabase SQL editor first (all 3 statements).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-body-site.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-body-site.ts --state NY
 *   npx tsx --env-file=.env.local scripts/backfill-body-site.ts
 */

import { runBackfill } from "./lib/run-backfill";

async function main() {
  await runBackfill({
    label: "Body Site",
    column: "body_site",
    backfillSql: `
      UPDATE charges c
      SET body_site = computed.site
      FROM (
        SELECT c2.id, parse_body_site(c2.description) AS site
        FROM charges c2
        JOIN providers p ON c2.provider_id = p.id
        WHERE p.state = $1
          AND c2.body_site IS NULL
          AND c2.description IS NOT NULL
      ) computed
      WHERE c.id = computed.id
        AND computed.site IS NOT NULL
    `,
    dryRunSql: `
      SELECT COUNT(*)::int AS cnt
      FROM (
        SELECT parse_body_site(c.description) AS site
        FROM charges c
        JOIN providers p ON c.provider_id = p.id
        WHERE p.state = $1
          AND c.body_site IS NULL
          AND c.description IS NOT NULL
      ) computed
      WHERE computed.site IS NOT NULL
    `,
    smokeTestSql: "SELECT parse_body_site('MR KNEE NO IV CONTRAST')",
    smokeTestError:
      "ERROR: parse_body_site() function not found.\n" +
      "Run migration-body-site.sql in Supabase SQL editor first.",
    distributionSql:
      "SELECT body_site, COUNT(*)::int AS cnt FROM charges GROUP BY body_site ORDER BY cnt DESC",
  });
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
