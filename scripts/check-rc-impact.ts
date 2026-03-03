/**
 * How many "duplicates" are true dupes vs revenue-code variants?
 * Compares dedup counts with and without revenue_code in the grouping.
 * Uses TX as sample.
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

  const state = process.argv[2]?.toUpperCase() || "TX";
  console.log(`=== Revenue Code Impact Analysis (${state}) ===\n`);

  // Count WITHOUT revenue_code (current dedup)
  const { rows: [without] } = await client.query(`
    SELECT COUNT(*)::int AS excess FROM (
      SELECT ROW_NUMBER() OVER (
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
  `, [state]);
  console.log(`  Without revenue_code/ndc/icd: ${Number(without.excess).toLocaleString()} excess rows`);

  // Count WITH revenue_code, ndc, icd (truly conservative)
  const { rows: [withRc] } = await client.query(`
    SELECT COUNT(*)::int AS excess FROM (
      SELECT ROW_NUMBER() OVER (
        PARTITION BY c.provider_id,
          COALESCE(c.cpt, ''), COALESCE(c.hcpcs, ''), COALESCE(c.ms_drg, ''),
          COALESCE(c.description, ''), COALESCE(c.billing_class, ''),
          COALESCE(c.setting, ''), COALESCE(c.modifiers, ''),
          COALESCE(c.revenue_code, ''), COALESCE(c.ndc, ''), COALESCE(c.icd, ''),
          c.cash_price, c.gross_charge, c.min_price, c.max_price,
          c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
          c.payer_count
        ORDER BY c.created_at ASC, c.id ASC
      ) AS row_num
      FROM charges c
      JOIN providers p ON c.provider_id = p.id
      WHERE p.state = $1
    ) ranked WHERE row_num > 1
  `, [state]);
  console.log(`  With revenue_code/ndc/icd:    ${Number(withRc.excess).toLocaleString()} excess rows`);
  console.log(`  Revenue-code variants:        ${(Number(without.excess) - Number(withRc.excess)).toLocaleString()} rows`);
  console.log(`  True all-column duplicates:   ${Number(withRc.excess).toLocaleString()} rows`);

  // Total charges for this state
  const { rows: [{ cnt: total }] } = await client.query(`
    SELECT COUNT(*)::int AS cnt FROM charges c
    JOIN providers p ON c.provider_id = p.id WHERE p.state = $1
  `, [state]);
  console.log(`\n  Total ${state} charges: ${Number(total).toLocaleString()}`);
  console.log(`  Current dedup would remove: ${((Number(without.excess) / Number(total)) * 100).toFixed(1)}%`);
  console.log(`  Conservative dedup would remove: ${((Number(withRc.excess) / Number(total)) * 100).toFixed(1)}%`);

  // Check how many rows have non-null revenue_code
  const { rows: [rcStats] } = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(revenue_code)::int AS has_rc,
      COUNT(ndc)::int AS has_ndc,
      COUNT(icd)::int AS has_icd,
      COUNT(DISTINCT revenue_code)::int AS distinct_rc
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
  `, [state]);
  console.log(`\n  Rows with revenue_code: ${rcStats.has_rc.toLocaleString()} of ${rcStats.total.toLocaleString()} (${((rcStats.has_rc / rcStats.total) * 100).toFixed(1)}%)`);
  console.log(`  Distinct revenue_codes: ${rcStats.distinct_rc}`);
  console.log(`  Rows with ndc: ${rcStats.has_ndc.toLocaleString()}`);
  console.log(`  Rows with icd: ${rcStats.has_icd.toLocaleString()}`);

  client.release();
  await pgPool.end();
}
main().catch(console.error);
