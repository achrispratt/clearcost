/**
 * Backfill the laterality column on existing charges using the SQL
 * parse_laterality() function (must be deployed first via migration-laterality.sql).
 *
 * All parsing runs inside Postgres — Node.js only manages state-by-state
 * control flow and progress logging.
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

import { Pool as PgPool } from "pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs(): {
  dryRun: boolean;
  state: string | null;
  skipStates: string[];
} {
  const args = process.argv.slice(2);
  let dryRun = false;
  let state: string | null = null;
  const skipStates: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--state" && args[i + 1]) {
      state = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === "--skip-states" && args[i + 1]) {
      skipStates.push(
        ...args[i + 1].split(",").map((s) => s.trim().toUpperCase())
      );
      i++;
    }
  }
  return { dryRun, state, skipStates };
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

// Backfill: set laterality using the SQL function, only for un-processed rows
// where at least one source field (description or modifiers) is non-null.
// The subquery filter ensures we only UPDATE rows where parse_laterality returns non-null.
const BACKFILL_SQL = `
  UPDATE charges c
  SET laterality = parse_laterality(c.description, c.modifiers)
  FROM providers p
  WHERE c.provider_id = p.id
    AND p.state = $1
    AND c.laterality IS NULL
    AND (c.description IS NOT NULL OR c.modifiers IS NOT NULL)
    AND parse_laterality(c.description, c.modifiers) IS NOT NULL
`;

// Dry-run: count how many rows would be updated per state.
const DRY_RUN_SQL = `
  SELECT COUNT(*)::int AS cnt
  FROM charges c
  JOIN providers p ON c.provider_id = p.id
  WHERE p.state = $1
    AND c.laterality IS NULL
    AND (c.description IS NOT NULL OR c.modifiers IS NOT NULL)
    AND parse_laterality(c.description, c.modifiers) IS NOT NULL
`;

// Count total charges in state (for context).
const STATE_COUNT_SQL = `
  SELECT COUNT(*)::int AS cnt
  FROM charges c
  JOIN providers p ON c.provider_id = p.id
  WHERE p.state = $1
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface StateResult {
  state: string;
  total: number;
  updated: number;
  elapsedSec: number;
}

async function main() {
  const config = parseArgs();

  console.log("=== ClearCost Laterality Backfill ===\n");
  console.log(
    `  Mode: ${config.dryRun ? "DRY RUN (no data will be modified)" : "LIVE — laterality will be set"}`
  );
  if (config.state) console.log(`  State filter: ${config.state}`);
  if (config.skipStates.length > 0)
    console.log(`  Skipping states: ${config.skipStates.join(", ")}`);
  console.log();

  // Connect via Supabase pooler (port 6543)
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("ERROR: SUPABASE_DB_URL not set. Use --env-file=.env.local");
    process.exit(1);
  }
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  pgPool.on("error", (err) => {
    console.warn(`  Pool background error (non-fatal): ${err.message}`);
  });
  await pgPool.query("SELECT 1");
  console.log("  Postgres pool connected\n");

  // Verify parse_laterality() function exists
  try {
    await pgPool.query("SELECT parse_laterality('MRI KNEE RT', 'RT')");
  } catch {
    console.error(
      "ERROR: parse_laterality() function not found.\n" +
        "Run migration-laterality.sql in Supabase SQL editor first."
    );
    process.exit(1);
  }

  // Get state list
  let states: string[];
  if (config.state) {
    states = [config.state];
  } else {
    const { rows } = await pgPool.query(
      "SELECT DISTINCT state FROM providers WHERE state IS NOT NULL ORDER BY state"
    );
    states = rows.map((r: { state: string }) => r.state);
  }

  // Process each state
  const results: StateResult[] = [];
  let grandTotalUpdated = 0;
  const overallStart = Date.now();

  for (const state of states) {
    if (config.skipStates.includes(state)) {
      console.log(`  [${ts()}] ${state}: skipping`);
      continue;
    }

    // Health check
    try {
      await pgPool.query("SELECT 1");
    } catch {
      console.warn(
        `  [${ts()}] ${state}: Postgres health check failed, waiting 10s...`
      );
      await new Promise((r) => setTimeout(r, 10000));
      try {
        await pgPool.query("SELECT 1");
        console.log(`  [${ts()}] ${state}: reconnected after retry`);
      } catch (retryErr) {
        console.error(
          `  [${ts()}] ${state}: SKIPPING — Postgres unreachable (${retryErr instanceof Error ? retryErr.message : retryErr})`
        );
        continue;
      }
    }

    const stateStart = Date.now();
    const client = await pgPool.connect();

    try {
      await client.query("SET statement_timeout = 0");

      // Count total charges in state
      const {
        rows: [{ cnt: total }],
      } = await client.query(STATE_COUNT_SQL, [state]);

      let updated: number;
      if (config.dryRun) {
        const {
          rows: [{ cnt }],
        } = await client.query(DRY_RUN_SQL, [state]);
        updated = cnt;
      } else {
        const result = await client.query(BACKFILL_SQL, [state]);
        updated = result.rowCount ?? 0;
      }

      const elapsed = (Date.now() - stateStart) / 1000;
      results.push({
        state,
        total,
        updated,
        elapsedSec: parseFloat(elapsed.toFixed(1)),
      });
      grandTotalUpdated += updated;

      if (updated > 0) {
        const pct = ((updated / total) * 100).toFixed(1);
        console.log(
          `  [${ts()}] ${state}: ${updated.toLocaleString()} / ${total.toLocaleString()} ` +
            `(${pct}%) ${config.dryRun ? "would be" : ""} updated (${elapsed.toFixed(1)}s)`
        );
      } else {
        console.log(
          `  [${ts()}] ${state}: ${total.toLocaleString()} charges, none matched (${elapsed.toFixed(1)}s)`
        );
      }

      client.release();
    } catch (err) {
      client.release(true);
      console.error(
        `  [${ts()}] ${state}: ERROR — ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // Summary
  const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log("\n── Summary ──\n");
  console.log(`  Mode:            ${config.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Total updated:   ${grandTotalUpdated.toLocaleString()}`);
  console.log(`  Duration:        ${overallElapsed}s`);

  // Post-backfill distribution (live mode, all states)
  if (!config.dryRun && !config.state) {
    console.log("\n── Laterality Distribution ──\n");
    const { rows: distRows } = await pgPool.query(
      "SELECT laterality, COUNT(*)::int AS cnt FROM charges GROUP BY laterality ORDER BY cnt DESC"
    );
    for (const row of distRows) {
      console.log(
        `  ${row.laterality ?? "(null)"}: ${Number(row.cnt).toLocaleString()}`
      );
    }
  }

  // JSON summary
  console.log("\n── JSON Summary ──\n");
  console.log(
    JSON.stringify(
      {
        mode: config.dryRun ? "dry_run" : "live",
        totalUpdated: grandTotalUpdated,
        durationSec: parseFloat(overallElapsed),
        states: results,
      },
      null,
      2
    )
  );

  await pgPool.end();
  console.log("\n  Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
