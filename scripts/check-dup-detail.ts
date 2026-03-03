/**
 * Temporary diagnostic: inspect duplicate row metadata for a specific
 * provider + code to understand if they're source-data duplicates or
 * import-pipeline duplicates.
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

  // Find Baylor Heart Hospital Plano provider_id
  const { rows: providers } = await pgPool.query(
    "SELECT id, name FROM providers WHERE name ILIKE '%BAYLOR%HEART%PLANO%' OR name ILIKE '%BAYLOR SCOTT%PLANO%' LIMIT 5"
  );
  console.log("Providers found:");
  for (const p of providers) console.log("  " + p.id + " " + p.name);

  if (providers.length === 0) {
    console.log("No providers found");
    await pgPool.end();
    return;
  }

  const pid = providers[0].id;

  // Count total and distinct descriptions for 86003
  const { rows: [stats] } = await pgPool.query(
    `SELECT COUNT(*)::int as total,
            COUNT(DISTINCT description)::int as distinct_desc,
            COUNT(DISTINCT cash_price)::int as distinct_prices,
            COUNT(DISTINCT billing_class)::int as distinct_billing,
            COUNT(DISTINCT setting)::int as distinct_setting,
            COUNT(DISTINCT avg_negotiated_rate)::int as distinct_avg_rates,
            COUNT(DISTINCT payer_count)::int as distinct_payer_counts
     FROM charges
     WHERE provider_id = $1 AND hcpcs = '86003'`,
    [pid]
  );
  console.log("\nStats for hcpcs=86003:");
  console.log("  Total rows: " + stats.total);
  console.log("  Distinct descriptions: " + stats.distinct_desc);
  console.log("  Distinct cash_prices: " + stats.distinct_prices);
  console.log("  Distinct billing_class: " + stats.distinct_billing);
  console.log("  Distinct setting: " + stats.distinct_setting);
  console.log("  Distinct avg_negotiated_rate: " + stats.distinct_avg_rates);
  console.log("  Distinct payer_count: " + stats.distinct_payer_counts);

  // Show top description groups
  const { rows: descs } = await pgPool.query(
    `SELECT description, cash_price, COUNT(*)::int as cnt
     FROM charges
     WHERE provider_id = $1 AND hcpcs = '86003'
     GROUP BY description, cash_price
     ORDER BY cnt DESC
     LIMIT 15`,
    [pid]
  );
  console.log("\nTop description + price groups:");
  for (const d of descs) {
    console.log("  x" + d.cnt + " | $" + d.cash_price + " | " + (d.description || "NULL").slice(0, 65));
  }

  // True all-column duplicates
  const { rows: dupCheck } = await pgPool.query(
    `SELECT description, cash_price, COUNT(*)::int as cnt
     FROM charges
     WHERE provider_id = $1 AND hcpcs = '86003'
     GROUP BY provider_id, description, cash_price, billing_class, setting, modifiers,
              gross_charge, min_price, max_price,
              avg_negotiated_rate, min_negotiated_rate, max_negotiated_rate,
              payer_count, cpt, ms_drg
     HAVING COUNT(*) > 1
     ORDER BY cnt DESC
     LIMIT 10`,
    [pid]
  );
  console.log("\nTrue all-column duplicate groups (groups where EVERY column matches):");
  if (dupCheck.length === 0) {
    console.log("  NONE — no true all-column duplicates for this provider+code");
  } else {
    for (const d of dupCheck) {
      console.log("  x" + d.cnt + " | $" + d.cash_price + " | " + (d.description || "NULL").slice(0, 65));
    }
  }

  // Broader check: pick any TX provider with known all-column dupes
  // Use the same query our investigation used
  console.log("\n\n=== Spot-check: a TX provider with known all-column dupes ===");
  const { rows: txDups } = await pgPool.query(`
    SELECT c.provider_id, p.name, c.hcpcs, c.cpt, c.description,
           c.cash_price, c.billing_class, c.setting, COUNT(*)::int as cnt
    FROM charges c
    JOIN providers p ON c.provider_id = p.id
    WHERE p.state = 'TX'
    GROUP BY c.provider_id, p.name, c.cpt, c.hcpcs, c.ms_drg,
             c.description, c.billing_class, c.setting, c.modifiers,
             c.cash_price, c.gross_charge, c.min_price, c.max_price,
             c.avg_negotiated_rate, c.min_negotiated_rate, c.max_negotiated_rate,
             c.payer_count
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `);
  for (const d of txDups) {
    console.log("  x" + d.cnt + " | " + d.name.slice(0, 40) + " | " + (d.cpt || d.hcpcs) + " | " + (d.description || "").slice(0, 50) + " | billing=" + d.billing_class + " | setting=" + d.setting + " | $" + d.cash_price);
  }

  // For the top dup group, show created_at timestamps
  if (txDups.length > 0) {
    const top = txDups[0];
    console.log("\n--- Created_at timestamps for top dup group ---");
    const { rows: timestamps } = await pgPool.query(`
      SELECT created_at, COUNT(*)::int as cnt
      FROM charges
      WHERE provider_id = $1
        AND COALESCE(cpt, '') = $2
        AND COALESCE(hcpcs, '') = $3
        AND description = $4
        AND cash_price = $5
      GROUP BY created_at
      ORDER BY created_at
    `, [top.provider_id, top.cpt || '', top.hcpcs || '', top.description, top.cash_price]);
    for (const t of timestamps) {
      console.log("  " + t.created_at.toISOString() + " (" + t.cnt + " rows)");
    }
  }

  await pgPool.end();
}
main().catch(console.error);
