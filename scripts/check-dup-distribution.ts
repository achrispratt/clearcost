/**
 * Diagnostic: what codes and patterns are driving duplicates?
 * Uses state-by-state processing to stay within Supabase resource limits.
 */
import { Pool as PgPool } from "pg";

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) { console.error("No SUPABASE_DB_URL"); process.exit(1); }
  const poolerUrl = dbUrl.replace(/:5432\//, ":6543/");
  const pgPool = new PgPool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 30000,
  });

  const client = await pgPool.connect();
  await client.query("SET statement_timeout = 0");

  // ── Q1: Multiplier distribution (how many copies typically?) ──────
  // Use TX as sample (largest state, most dupes)
  console.log("=== Duplication multiplier distribution (TX sample) ===\n");
  const { rows: multipliers } = await client.query(`
    SELECT
      CASE
        WHEN cnt = 2 THEN '2x (1 extra copy)'
        WHEN cnt BETWEEN 3 AND 5 THEN '3-5x'
        WHEN cnt BETWEEN 6 AND 10 THEN '6-10x'
        WHEN cnt BETWEEN 11 AND 50 THEN '11-50x'
        WHEN cnt BETWEEN 51 AND 100 THEN '51-100x'
        WHEN cnt > 100 THEN '100x+'
      END AS multiplier,
      COUNT(*)::int AS groups,
      SUM(cnt - 1)::int AS excess_rows
    FROM (
      SELECT COUNT(*) AS cnt
      FROM charges c
      JOIN providers p ON c.provider_id = p.id
      WHERE p.state = 'TX'
      GROUP BY c.provider_id, c.description, c.billing_class, c.setting,
               c.modifiers, c.cpt, c.hcpcs, c.ms_drg,
               c.cash_price, c.gross_charge, c.min_price, c.max_price,
               c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
               c.payer_count
      HAVING COUNT(*) > 1
    ) grouped
    GROUP BY 1
    ORDER BY MIN(cnt)
  `);
  for (const m of multipliers) {
    console.log(`  ${m.multiplier}: ${Number(m.groups).toLocaleString()} groups, ${Number(m.excess_rows).toLocaleString()} excess rows`);
  }

  // ── Q2: Top codes with dupes (TX sample) ──────────────────────────
  console.log("\n=== Top 20 codes by excess rows (TX sample) ===\n");
  const { rows: topCodes } = await client.query(`
    SELECT code, SUM(excess)::int AS total_excess, COUNT(*)::int AS dup_groups
    FROM (
      SELECT COALESCE(NULLIF(c.cpt, ''), c.hcpcs) AS code,
             COUNT(*) - 1 AS excess
      FROM charges c
      JOIN providers p ON c.provider_id = p.id
      WHERE p.state = 'TX'
      GROUP BY c.provider_id, c.description, c.billing_class, c.setting,
               c.modifiers, c.cpt, c.hcpcs, c.ms_drg,
               c.cash_price, c.gross_charge, c.min_price, c.max_price,
               c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
               c.payer_count
      HAVING COUNT(*) > 1
    ) duped
    GROUP BY code
    ORDER BY SUM(excess) DESC
    LIMIT 20
  `);
  for (const r of topCodes) {
    console.log(`  ${r.code}: ${Number(r.total_excess).toLocaleString()} excess rows (${r.dup_groups} groups)`);
  }

  // ── Q3: Spot-check non-allergen/drug-test duplicates ──────────────
  console.log("\n=== Non-allergen/drug-test duplicates (TX, top 15) ===\n");
  const { rows: otherDups } = await client.query(`
    SELECT
      COALESCE(NULLIF(c.cpt, ''), c.hcpcs) AS code,
      c.description,
      p.name AS provider_name,
      c.cash_price,
      c.billing_class,
      c.setting,
      COUNT(*)::int AS cnt
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = 'TX'
      AND COALESCE(NULLIF(c.cpt, ''), c.hcpcs) NOT IN ('86003', '80307')
    GROUP BY c.provider_id, p.name, c.cpt, c.hcpcs, c.ms_drg,
             c.description, c.billing_class, c.setting, c.modifiers,
             c.cash_price, c.gross_charge, c.min_price, c.max_price,
             c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
             c.payer_count
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 15
  `);
  for (const d of otherDups) {
    console.log(`  x${d.cnt} | ${d.code} | ${d.provider_name.slice(0, 35)} | ${(d.description || "").slice(0, 45)} | ${d.billing_class || "-"} | ${d.setting || "-"} | $${d.cash_price}`);
  }

  // ── Q4: How many distinct codes have dupes vs total? ──────────────
  console.log("\n=== Breadth (TX sample) ===\n");
  const { rows: [breadth] } = await client.query(`
    SELECT
      (SELECT COUNT(DISTINCT COALESCE(NULLIF(cpt, ''), hcpcs))::int
       FROM charges c JOIN providers p ON c.provider_id = p.id
       WHERE p.state = 'TX') AS total_codes,
      COUNT(DISTINCT code)::int AS codes_with_dupes
    FROM (
      SELECT COALESCE(NULLIF(c.cpt, ''), c.hcpcs) AS code
      FROM charges c
      JOIN providers p ON c.provider_id = p.id
      WHERE p.state = 'TX'
      GROUP BY c.provider_id, c.cpt, c.hcpcs, c.ms_drg,
               c.description, c.billing_class, c.setting, c.modifiers,
               c.cash_price, c.gross_charge, c.min_price, c.max_price,
               c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
               c.payer_count
      HAVING COUNT(*) > 1
    ) duped
  `);
  console.log(`  Total codes in TX: ${breadth.total_codes}`);
  console.log(`  Codes with duplicates: ${breadth.codes_with_dupes}`);
  console.log(`  Codes affected: ${((breadth.codes_with_dupes / breadth.total_codes) * 100).toFixed(1)}%`);

  // ── Q5: A different state to compare (FL) ─────────────────────────
  console.log("\n=== Non-allergen/drug-test duplicates (FL, top 10) ===\n");
  const { rows: flDups } = await client.query(`
    SELECT
      COALESCE(NULLIF(c.cpt, ''), c.hcpcs) AS code,
      c.description,
      p.name AS provider_name,
      c.cash_price,
      COUNT(*)::int AS cnt
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = 'FL'
      AND COALESCE(NULLIF(c.cpt, ''), c.hcpcs) NOT IN ('86003', '80307')
    GROUP BY c.provider_id, p.name, c.cpt, c.hcpcs, c.ms_drg,
             c.description, c.billing_class, c.setting, c.modifiers,
             c.cash_price, c.gross_charge, c.min_price, c.max_price,
             c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
             c.payer_count
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);
  for (const d of flDups) {
    console.log(`  x${d.cnt} | ${d.code} | ${d.provider_name.slice(0, 35)} | ${(d.description || "").slice(0, 45)} | $${d.cash_price}`);
  }

  client.release();
  await pgPool.end();
  console.log("\nDone.");
}
main().catch(console.error);
