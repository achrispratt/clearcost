/**
 * Deduplicate charges table using conservative all-columns grouping.
 *
 * Processes state-by-state to avoid timeouts and stay within Supabase
 * Pro CPU/IO budget. Keeps the earliest row (by created_at, then id)
 * and deletes later byte-for-byte duplicates.
 *
 * All heavy computation (ROW_NUMBER window function, DELETE) runs as
 * SQL inside Postgres — Node.js only manages control flow.
 *
 * Issue: https://github.com/achrispratt/clearcost/issues/8
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/deduplicate-charges.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/deduplicate-charges.ts --state WY
 *   npx tsx --env-file=.env.local scripts/deduplicate-charges.ts
 */

import { Pool as PgPool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StateResult {
  state: string;
  before: number;
  after: number;
  deleted: number;
  elapsedSec: number;
}

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
      skipStates.push(...args[i + 1].split(",").map((s) => s.trim().toUpperCase()));
      i++;
    }
  }
  return { dryRun, state, skipStates };
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

// ---------------------------------------------------------------------------
// Dedup SQL
// ---------------------------------------------------------------------------

// Conservative all-columns dedup: keeps earliest row per group, deletes the rest.
// COALESCE wraps nullable columns so NULLs match each other in PARTITION BY.
const DEDUP_DELETE_SQL = `
  DELETE FROM charges WHERE id IN (
    SELECT id FROM (
      SELECT c.id, ROW_NUMBER() OVER (
        PARTITION BY c.provider_id,
          COALESCE(c.cpt, ''), COALESCE(c.hcpcs, ''), COALESCE(c.ms_drg, ''),
          COALESCE(c.description, ''), COALESCE(c.billing_class, ''),
          COALESCE(c.setting, ''), COALESCE(c.modifiers, ''),
          c.cash_price, c.gross_charge, c.min_price, c.max_price,
          c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
          c.payer_count
        ORDER BY c.created_at ASC, c.id ASC
      ) AS row_num
      FROM charges c
      JOIN providers p ON c.provider_id = p.id
      WHERE p.state = $1
    ) ranked WHERE row_num > 1
  )
`;

// Dry-run variant: counts what would be deleted without touching data.
const DEDUP_COUNT_SQL = `
  SELECT COUNT(*)::int AS cnt FROM (
    SELECT c.id, ROW_NUMBER() OVER (
      PARTITION BY c.provider_id,
        COALESCE(c.cpt, ''), COALESCE(c.hcpcs, ''), COALESCE(c.ms_drg, ''),
        COALESCE(c.description, ''), COALESCE(c.billing_class, ''),
        COALESCE(c.setting, ''), COALESCE(c.modifiers, ''),
        c.cash_price, c.gross_charge, c.min_price, c.max_price,
        c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
        c.payer_count
      ORDER BY c.created_at ASC, c.id ASC
    ) AS row_num
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
  ) ranked WHERE row_num > 1
`;

const STATE_COUNT_SQL = `
  SELECT COUNT(*)::int AS cnt
  FROM charges c
  JOIN providers p ON c.provider_id = p.id
  WHERE p.state = $1
`;

// Post-dedup verification: should return 0 after successful dedup.
const VERIFY_SQL = `
  SELECT COUNT(*)::int AS remaining_dup_groups FROM (
    SELECT 1
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
    GROUP BY c.provider_id, c.cpt, c.hcpcs, c.ms_drg, c.description,
      c.billing_class, c.setting, c.modifiers,
      c.cash_price, c.gross_charge, c.min_price, c.max_price,
      c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
      c.payer_count
    HAVING COUNT(*) > 1
  ) dupes
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log("=== ClearCost Charge Deduplication ===\n");
  console.log(`  Mode: ${config.dryRun ? "DRY RUN (no data will be modified)" : "LIVE — duplicates will be deleted"}`);
  if (config.state) console.log(`  State filter: ${config.state}`);
  if (config.skipStates.length > 0) console.log(`  Skipping states: ${config.skipStates.join(", ")}`);
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

  // Baseline total count
  const { rows: [{ cnt: totalBefore }] } = await pgPool.query(
    "SELECT COUNT(*)::int AS cnt FROM charges"
  );
  console.log(`  Total charges before: ${Number(totalBefore).toLocaleString()}\n`);

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
  let grandTotalDeleted = 0;
  const overallStart = Date.now();

  for (const state of states) {
    if (config.skipStates.includes(state)) {
      console.log(`  [${ts()}] ${state}: skipping`);
      continue;
    }

    // Health check before processing
    try {
      await pgPool.query("SELECT 1");
    } catch {
      console.warn(`  [${ts()}] ${state}: Postgres health check failed, waiting 10s...`);
      await new Promise((r) => setTimeout(r, 10000));
      try {
        await pgPool.query("SELECT 1");
        console.log(`  [${ts()}] ${state}: reconnected after retry`);
      } catch (retryErr) {
        console.error(`  [${ts()}] ${state}: SKIPPING — Postgres unreachable (${retryErr instanceof Error ? retryErr.message : retryErr})`);
        continue;
      }
    }

    const stateStart = Date.now();
    const client = await pgPool.connect();

    try {
      await client.query("SET statement_timeout = 0");

      // Count before
      const { rows: [{ cnt: before }] } = await client.query(STATE_COUNT_SQL, [state]);

      let deleted: number;
      if (config.dryRun) {
        // Dry run: count what would be deleted
        const { rows: [{ cnt }] } = await client.query(DEDUP_COUNT_SQL, [state]);
        deleted = cnt;
      } else {
        // Live: execute the DELETE
        const result = await client.query(DEDUP_DELETE_SQL, [state]);
        deleted = result.rowCount ?? 0;
      }

      const after = before - deleted;
      const elapsed = (Date.now() - stateStart) / 1000;

      results.push({ state, before, after, deleted, elapsedSec: parseFloat(elapsed.toFixed(1)) });
      grandTotalDeleted += deleted;

      if (deleted > 0) {
        console.log(`  [${ts()}] ${state}: ${before.toLocaleString()} → ${after.toLocaleString()} (${deleted.toLocaleString()} ${config.dryRun ? "would be" : ""} removed, ${elapsed.toFixed(1)}s)`);
      } else {
        console.log(`  [${ts()}] ${state}: ${before.toLocaleString()} charges, clean (${elapsed.toFixed(1)}s)`);
      }

      client.release();
    } catch (err) {
      client.release(true); // destroy broken connection
      console.error(`  [${ts()}] ${state}: ERROR — ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Post-dedup verification (live mode only) ─────────────────────────
  if (!config.dryRun && !config.state) {
    console.log("\n── Post-dedup verification ──\n");
    let totalRemainingDups = 0;

    for (const state of states) {
      if (config.skipStates.includes(state)) continue;
      try {
        const { rows: [{ remaining_dup_groups }] } = await pgPool.query(VERIFY_SQL, [state]);
        if (remaining_dup_groups > 0) {
          console.log(`  ${state}: WARNING — ${remaining_dup_groups} duplicate groups still remain`);
          totalRemainingDups += remaining_dup_groups;
        }
      } catch (err) {
        console.error(`  ${state}: verification error — ${err instanceof Error ? err.message : err}`);
      }
    }

    const { rows: [{ cnt: totalAfter }] } = await pgPool.query(
      "SELECT COUNT(*)::int AS cnt FROM charges"
    );

    console.log(`\n  Remaining duplicate groups: ${totalRemainingDups}`);
    console.log(`  Final total charges: ${Number(totalAfter).toLocaleString()}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);
  const totalAfterEstimate = Number(totalBefore) - grandTotalDeleted;

  console.log("\n── Summary ──\n");
  console.log(`  Mode:            ${config.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Total before:    ${Number(totalBefore).toLocaleString()}`);
  console.log(`  Total ${config.dryRun ? "would remove" : "removed"}:  ${grandTotalDeleted.toLocaleString()}`);
  console.log(`  Total after:     ${totalAfterEstimate.toLocaleString()}`);
  console.log(`  Reduction:       ${((grandTotalDeleted / Number(totalBefore)) * 100).toFixed(2)}%`);
  console.log(`  Duration:        ${overallElapsed}s`);

  // JSON summary
  console.log("\n── JSON Summary ──\n");
  console.log(JSON.stringify({
    mode: config.dryRun ? "dry_run" : "live",
    totalBefore: Number(totalBefore),
    totalDeleted: grandTotalDeleted,
    totalAfter: totalAfterEstimate,
    reductionPercent: ((grandTotalDeleted / Number(totalBefore)) * 100).toFixed(2),
    durationSec: parseFloat(overallElapsed),
    states: results,
  }, null, 2));

  await pgPool.end();
  console.log("\n  Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
