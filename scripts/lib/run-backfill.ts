/**
 * Shared backfill runner for column-level backfills.
 *
 * Handles Postgres pool management, state-by-state processing, progress
 * logging, dry-run mode, and post-backfill distribution reporting.
 *
 * Each backfill script provides a config object specifying the column,
 * SQL statements, and smoke-test query. The runner does everything else.
 */

import { Pool as PgPool } from "pg";

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface BackfillConfig {
  /** Display name for logging (e.g., "Laterality", "Body Site") */
  label: string;
  /** Column being backfilled */
  column: string;
  /**
   * UPDATE statement that computes and sets the column value.
   * Uses a CTE to call the parse function once per row.
   * $1 = state code.
   */
  backfillSql: string;
  /**
   * COUNT query for dry-run mode. Should use a CTE to call the parse
   * function once per row. $1 = state code.
   */
  dryRunSql: string;
  /** Smoke-test SQL to verify the parse function exists (no params). */
  smokeTestSql: string;
  /** Error message if the smoke test fails. */
  smokeTestError: string;
  /** Distribution query for post-backfill summary (no params). */
  distributionSql: string;
}

// ---------------------------------------------------------------------------
// CLI args
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

const STATE_COUNT_SQL = `
  SELECT COUNT(*)::int AS cnt
  FROM charges c
  JOIN providers p ON c.provider_id = p.id
  WHERE p.state = $1
`;

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface StateResult {
  state: string;
  total: number;
  updated: number;
  elapsedSec: number;
}

export async function runBackfill(config: BackfillConfig): Promise<void> {
  const cliArgs = parseArgs();

  console.log(`=== ClearCost ${config.label} Backfill ===\n`);
  console.log(
    `  Mode: ${cliArgs.dryRun ? "DRY RUN (no data will be modified)" : `LIVE — ${config.column} will be set`}`
  );
  if (cliArgs.state) console.log(`  State filter: ${cliArgs.state}`);
  if (cliArgs.skipStates.length > 0)
    console.log(`  Skipping states: ${cliArgs.skipStates.join(", ")}`);
  console.log();

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

  try {
    await pgPool.query(config.smokeTestSql);
  } catch {
    console.error(config.smokeTestError);
    process.exit(1);
  }

  let states: string[];
  if (cliArgs.state) {
    states = [cliArgs.state];
  } else {
    const { rows } = await pgPool.query(
      "SELECT DISTINCT state FROM providers WHERE state IS NOT NULL ORDER BY state"
    );
    states = rows.map((r: { state: string }) => r.state);
  }

  const results: StateResult[] = [];
  let grandTotalUpdated = 0;
  const overallStart = Date.now();

  for (const state of states) {
    if (cliArgs.skipStates.includes(state)) {
      console.log(`  [${ts()}] ${state}: skipping`);
      continue;
    }

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

      const {
        rows: [{ cnt: total }],
      } = await client.query(STATE_COUNT_SQL, [state]);

      let updated: number;
      if (cliArgs.dryRun) {
        const {
          rows: [{ cnt }],
        } = await client.query(config.dryRunSql, [state]);
        updated = cnt;
      } else {
        const result = await client.query(config.backfillSql, [state]);
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
            `(${pct}%) ${cliArgs.dryRun ? "would be" : ""} updated (${elapsed.toFixed(1)}s)`
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

  const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log("\n── Summary ──\n");
  console.log(`  Mode:            ${cliArgs.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Total updated:   ${grandTotalUpdated.toLocaleString()}`);
  console.log(`  Duration:        ${overallElapsed}s`);

  if (!cliArgs.dryRun && !cliArgs.state) {
    console.log(`\n── ${config.label} Distribution ──\n`);
    const { rows: distRows } = await pgPool.query(config.distributionSql);
    for (const row of distRows) {
      const value = row[config.column] ?? "(null)";
      console.log(`  ${value}: ${Number(row.cnt).toLocaleString()}`);
    }
  }

  console.log("\n── JSON Summary ──\n");
  console.log(
    JSON.stringify(
      {
        mode: cliArgs.dryRun ? "dry_run" : "live",
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
