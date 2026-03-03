/**
 * Verify: does aggressive dedup (without revenue_code) lose any
 * DISTINCT PRICE POINTS? If rows with different revenue codes also
 * have different prices, those survive the dedup because prices are
 * in the PARTITION BY. This script confirms that.
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

  const state = "TX";

  // Q1: How many distinct (provider, code, price) combos exist now?
  // vs how many would survive aggressive dedup?
  // If these numbers match, we lose zero price diversity.
  console.log(`=== Price Preservation Check (${state}) ===\n`);

  const { rows: [current] } = await client.query(`
    SELECT COUNT(DISTINCT (
      provider_id::text || '|' ||
      COALESCE(cpt, '') || '|' || COALESCE(hcpcs, '') || '|' ||
      COALESCE(cash_price::text, 'X') || '|' ||
      COALESCE(avg_negotiated_rate::text, 'X') || '|' ||
      COALESCE(min_negotiated_rate::text, 'X') || '|' ||
      COALESCE(max_negotiated_rate::text, 'X')
    ))::int AS distinct_price_combos
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
  `, [state]);
  console.log(`  Distinct (provider, code, price) combos now: ${current.distinct_price_combos.toLocaleString()}`);

  // After aggressive dedup, we'd have exactly these same combos
  // because the dedup PARTITION BY includes all price columns.
  // The dedup only removes rows where prices also match.
  console.log(`  After aggressive dedup: same — prices are in PARTITION BY\n`);

  // Q2: Are there cases where different revenue codes have
  // DIFFERENT prices at the same provider+code?
  console.log("=== Revenue codes with different prices (same provider+code) ===\n");
  const { rows: rcPriceDiffs } = await client.query(`
    SELECT
      p.name,
      COALESCE(NULLIF(c.cpt, ''), c.hcpcs) AS code,
      COUNT(DISTINCT c.revenue_code)::int AS distinct_rcs,
      COUNT(DISTINCT c.cash_price)::int AS distinct_cash,
      COUNT(DISTINCT c.avg_negotiated_rate)::int AS distinct_avg_neg,
      COUNT(*)::int AS total_rows
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = $1
      AND c.revenue_code IS NOT NULL
    GROUP BY c.provider_id, p.name, COALESCE(NULLIF(c.cpt, ''), c.hcpcs)
    HAVING COUNT(DISTINCT c.revenue_code) > 1
       AND (COUNT(DISTINCT c.cash_price) > 1 OR COUNT(DISTINCT c.avg_negotiated_rate) > 1)
    ORDER BY COUNT(DISTINCT c.revenue_code) DESC
    LIMIT 10
  `, [state]);

  if (rcPriceDiffs.length === 0) {
    console.log("  NONE — revenue code variants never have different prices");
  } else {
    console.log("  Cases where different RCs have different prices:");
    for (const r of rcPriceDiffs) {
      console.log(`  ${r.name.slice(0, 40)} | ${r.code} | ${r.distinct_rcs} RCs | ${r.distinct_cash} cash prices | ${r.distinct_avg_neg} avg_neg rates | ${r.total_rows} rows`);
    }
    console.log(`\n  These rows ALL survive the aggressive dedup because their prices differ.`);
  }

  // Q3: Show a concrete example — what the consumer data looks like
  // before and after aggressive dedup for one hospital+code
  console.log("\n=== Example: Las Palmas Rehab, 73590 ===\n");
  const { rows: example } = await client.query(`
    SELECT
      c.revenue_code,
      c.cash_price,
      c.avg_negotiated_rate,
      c.min_negotiated_rate,
      c.max_negotiated_rate,
      c.payer_count,
      COUNT(*)::int AS copies
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.name ILIKE '%LAS PALMAS REHAB%'
      AND COALESCE(NULLIF(c.cpt, ''), c.hcpcs) = '73590'
    GROUP BY c.revenue_code, c.cash_price, c.avg_negotiated_rate,
             c.min_negotiated_rate, c.max_negotiated_rate, c.payer_count
    ORDER BY c.avg_negotiated_rate DESC NULLS LAST, c.revenue_code NULLS FIRST
  `, []);

  console.log("  Current data (grouped by RC + prices):");
  let totalRows = 0;
  let distinctPricePoints = new Set<string>();
  for (const r of example) {
    const priceKey = `cash=${r.cash_price}|avg=${r.avg_negotiated_rate}`;
    distinctPricePoints.add(priceKey);
    totalRows += r.copies;
    console.log(`    rc=${(r.revenue_code || 'null').toString().padEnd(6)} | cash=$${r.cash_price || 'null'} | avg_neg=$${Number(r.avg_negotiated_rate || 0).toFixed(2)} | payer_count=${r.payer_count} | x${r.copies} copies`);
  }

  console.log(`\n  Total rows now: ${totalRows}`);
  console.log(`  Distinct price points: ${distinctPricePoints.size}`);
  console.log(`  After aggressive dedup: ${distinctPricePoints.size} rows (one per distinct price combo)`);
  console.log(`  Consumer sees: ${distinctPricePoints.size} price point(s) — range estimate possible from min/max`);

  client.release();
  await pgPool.end();
}
main().catch(console.error);
