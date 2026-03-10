/**
 * Backfill the laterality column on existing charges using the SQL
 * parse_laterality() function (must be deployed first via migration-laterality.sql).
 *
 * Issue: https://github.com/achrispratt/clearcost/issues/48
 *
 * Prerequisites:
 *   Run migration-laterality.sql in Supabase SQL editor first (all 3 statements).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-laterality.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-laterality.ts --state NY
 *   npx tsx --env-file=.env.local scripts/backfill-laterality.ts
 */

import { runBackfill } from "./lib/run-backfill";

async function main() {
  await runBackfill({
    label: "Laterality",
    column: "laterality",
    backfillSql: `
      UPDATE charges c
      SET laterality = computed.lat
      FROM (
        SELECT c2.id, parse_laterality(c2.description, c2.modifiers) AS lat
        FROM charges c2
        JOIN providers p ON c2.provider_id = p.id
        WHERE p.state = $1
          AND c2.laterality IS NULL
          AND (c2.description IS NOT NULL OR c2.modifiers IS NOT NULL)
      ) computed
      WHERE c.id = computed.id
        AND computed.lat IS NOT NULL
    `,
    dryRunSql: `
      SELECT COUNT(*)::int AS cnt
      FROM (
        SELECT parse_laterality(c.description, c.modifiers) AS lat
        FROM charges c
        JOIN providers p ON c.provider_id = p.id
        WHERE p.state = $1
          AND c.laterality IS NULL
          AND (c.description IS NOT NULL OR c.modifiers IS NOT NULL)
      ) computed
      WHERE computed.lat IS NOT NULL
    `,
    smokeTestSql: "SELECT parse_laterality('MRI KNEE RT', 'RT')",
    smokeTestError:
      "ERROR: parse_laterality() function not found.\n" +
      "Run migration-laterality.sql in Supabase SQL editor first.",
    distributionSql:
      "SELECT laterality, COUNT(*)::int AS cnt FROM charges GROUP BY laterality ORDER BY cnt DESC",
  });
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
