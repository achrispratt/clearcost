/**
 * Duplicate charge investigation script (read-only).
 *
 * Scans the charges table state-by-state using conservative all-columns
 * GROUP BY to quantify duplicate patterns. Outputs a structured report
 * answering: are these true byte-for-byte dupes, or legitimate billing_class
 * variants?
 *
 * All heavy computation runs as SQL inside Postgres — Node.js only manages
 * control flow and formats output.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/investigate-duplicates.ts
 *   npx tsx --env-file=.env.local scripts/investigate-duplicates.ts --state WY
 */

import { Pool as PgPool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StateDupSummary {
  state: string;
  totalCharges: number;
  dupGroups: number;
  excessRows: number;
}

interface DupExample {
  state: string;
  providerName: string;
  cpt: string;
  hcpcs: string;
  description: string;
  billingClass: string;
  setting: string;
  cashPrice: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function parseArgs(): { state: string | null } {
  const args = process.argv.slice(2);
  let state: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--state" && args[i + 1]) {
      state = args[i + 1].toUpperCase();
      i++;
    }
  }
  return { state };
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log("=== ClearCost Duplicate Investigation ===\n");
  if (config.state) console.log(`  State filter: ${config.state}`);
  console.log(`  Mode: READ-ONLY (no data will be modified)\n`);

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

  // ── Step 1: Baseline total count ──────────────────────────────────────
  const { rows: [{ count: totalCharges }] } = await pgPool.query(
    "SELECT COUNT(*)::int AS count FROM charges"
  );
  console.log(`  Total charges in database: ${Number(totalCharges).toLocaleString()}\n`);

  // ── Step 2: Get state list ────────────────────────────────────────────
  let states: string[];
  if (config.state) {
    states = [config.state];
  } else {
    const { rows } = await pgPool.query(
      "SELECT DISTINCT state FROM providers WHERE state IS NOT NULL ORDER BY state"
    );
    states = rows.map((r: { state: string }) => r.state);
  }
  console.log(`  Processing ${states.length} states\n`);

  // ── Step 3: All-column GROUP BY per state ─────────────────────────────
  console.log("── Conservative all-column duplicate scan ──\n");

  const stateSummaries: StateDupSummary[] = [];
  const allExamples: DupExample[] = [];
  let totalDupGroups = 0;
  let totalExcessRows = 0;
  const scanStart = Date.now();

  for (const state of states) {
    const client = await pgPool.connect();
    try {
      await client.query("SET statement_timeout = 0");

      // Count charges for this state
      const { rows: [{ count: stateTotal }] } = await client.query(
        `SELECT COUNT(*)::int AS count FROM charges c
         JOIN providers p ON c.provider_id = p.id
         WHERE p.state = $1`,
        [state]
      );

      // Find all-column duplicate groups
      const { rows: dupRows } = await client.query(
        `SELECT
           c.provider_id,
           p.name AS provider_name,
           COALESCE(c.cpt, '') AS cpt,
           COALESCE(c.hcpcs, '') AS hcpcs,
           COALESCE(c.ms_drg, '') AS ms_drg,
           COALESCE(c.description, '') AS description,
           COALESCE(c.billing_class, '') AS billing_class,
           COALESCE(c.setting, '') AS setting,
           COALESCE(c.modifiers, '') AS modifiers,
           c.cash_price, c.gross_charge, c.min_price, c.max_price,
           c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
           c.payer_count,
           COUNT(*)::int AS cnt
         FROM charges c
         JOIN providers p ON c.provider_id = p.id
         WHERE p.state = $1
         GROUP BY c.provider_id, p.name,
           c.cpt, c.hcpcs, c.ms_drg, c.description, c.billing_class,
           c.setting, c.modifiers,
           c.cash_price, c.gross_charge, c.min_price, c.max_price,
           c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
           c.payer_count
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC`,
        [state]
      );

      const dupGroups = dupRows.length;
      const excessRows = dupRows.reduce((sum: number, r: { cnt: number }) => sum + (r.cnt - 1), 0);

      stateSummaries.push({
        state,
        totalCharges: Number(stateTotal),
        dupGroups,
        excessRows,
      });
      totalDupGroups += dupGroups;
      totalExcessRows += excessRows;

      // Collect top examples (up to 3 per state)
      for (const row of dupRows.slice(0, 3)) {
        allExamples.push({
          state,
          providerName: row.provider_name || "Unknown",
          cpt: row.cpt,
          hcpcs: row.hcpcs,
          description: (row.description || "").slice(0, 60),
          billingClass: row.billing_class,
          setting: row.setting,
          cashPrice: row.cash_price != null ? `$${Number(row.cash_price).toFixed(2)}` : "null",
          count: row.cnt,
        });
      }

      const elapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
      if (dupGroups > 0) {
        console.log(`  [${ts()}] ${state}: ${Number(stateTotal).toLocaleString()} charges, ${dupGroups.toLocaleString()} dup groups, ${excessRows.toLocaleString()} excess rows (${elapsed}s)`);
      } else {
        console.log(`  [${ts()}] ${state}: ${Number(stateTotal).toLocaleString()} charges, clean (${elapsed}s)`);
      }
    } catch (err) {
      console.error(`  [${ts()}] ${state}: ERROR — ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }

  // ── Step 4: Summary ───────────────────────────────────────────────────
  console.log("\n── Summary ──\n");
  console.log(`  Total charges:        ${Number(totalCharges).toLocaleString()}`);
  console.log(`  Duplicate groups:     ${totalDupGroups.toLocaleString()}`);
  console.log(`  Excess rows to remove: ${totalExcessRows.toLocaleString()}`);
  console.log(`  Post-dedup estimate:  ${(Number(totalCharges) - totalExcessRows).toLocaleString()}`);
  console.log(`  Reduction:            ${((totalExcessRows / Number(totalCharges)) * 100).toFixed(2)}%`);

  // Top states by excess rows
  const topStates = [...stateSummaries]
    .filter((s) => s.excessRows > 0)
    .sort((a, b) => b.excessRows - a.excessRows)
    .slice(0, 10);

  if (topStates.length > 0) {
    console.log("\n  Top states by duplicate count:");
    for (const s of topStates) {
      console.log(`    ${s.state}: ${s.excessRows.toLocaleString()} excess rows (${s.dupGroups.toLocaleString()} groups) out of ${s.totalCharges.toLocaleString()}`);
    }
  }

  // Top examples
  const topExamples = allExamples
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  if (topExamples.length > 0) {
    console.log("\n  Top duplicate examples:");
    for (const ex of topExamples) {
      console.log(`    ${ex.state} | ${ex.providerName} | ${ex.cpt || ex.hcpcs} | ${ex.description} | ${ex.billingClass || "-"} | ${ex.setting || "-"} | ${ex.cashPrice} | ×${ex.count}`);
    }
  }

  // Clean states
  const cleanStates = stateSummaries.filter((s) => s.excessRows === 0);
  if (cleanStates.length > 0) {
    console.log(`\n  Clean states (no duplicates): ${cleanStates.map((s) => s.state).join(", ")}`);
  }

  const totalElapsed = ((Date.now() - scanStart) / 1000).toFixed(1);
  console.log(`\n  Scan completed in ${totalElapsed}s`);

  // ── JSON summary ──────────────────────────────────────────────────────
  console.log("\n── JSON Summary ──\n");
  console.log(JSON.stringify({
    totalCharges: Number(totalCharges),
    totalDupGroups,
    totalExcessRows,
    postDedupEstimate: Number(totalCharges) - totalExcessRows,
    reductionPercent: ((totalExcessRows / Number(totalCharges)) * 100).toFixed(2),
    statesScanned: states.length,
    statesWithDupes: stateSummaries.filter((s) => s.excessRows > 0).length,
    topStates: topStates.map((s) => ({
      state: s.state,
      excessRows: s.excessRows,
      dupGroups: s.dupGroups,
    })),
  }, null, 2));

  await pgPool.end();
  console.log("\n  Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
