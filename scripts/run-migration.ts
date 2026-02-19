/**
 * Run the ClearCost schema migration against the remote Supabase database.
 *
 * Usage: npx tsx --env-file=.env.local scripts/run-migration.ts
 *
 * This script:
 * 1. Drops old tables/functions that conflict with the new schema
 * 2. Runs the full schema.sql to create new tables, indexes, RPCs, and RLS policies
 * 3. Verifies the migration was successful
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

// Use service role for admin access (bypasses RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runSQL(sql: string, label: string): Promise<boolean> {
  console.log(`\n🔄 ${label}...`);
  const { error } = await supabase.rpc("exec_sql", { sql_text: sql });
  if (error) {
    // Try the direct REST approach if rpc doesn't exist
    console.log(`   ⚠️  rpc not available, trying direct approach...`);
    return false;
  }
  console.log(`   ✅ ${label} — done`);
  return true;
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   ClearCost Database Migration           ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n📌 Target: ${SUPABASE_URL}`);

  // Step 1: Drop old tables/functions
  console.log("\n━━━ Step 1: Dropping old tables and functions ━━━");

  const dropStatements = [
    "drop function if exists search_prices_nearby cascade",
    "drop function if exists search_charges_nearby cascade",
    "drop function if exists search_charges_by_description cascade",
    "drop table if exists negotiated_rates cascade",
    "drop table if exists payer_rates cascade",
    "drop table if exists prices cascade",
    "drop table if exists charges cascade",
    "drop table if exists hospitals cascade",
    "drop table if exists providers cascade",
    "drop table if exists payers cascade",
    "drop table if exists saved_searches cascade",
  ];

  for (const stmt of dropStatements) {
    const tableName = stmt.match(/(?:table|function)\s+(?:if\s+exists\s+)?(\w+)/)?.[1] || stmt;
    try {
      // Use the Supabase PostgREST interface to run raw SQL via pg_net or similar
      // Since we can't run raw DDL through PostgREST, we need the SQL API
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      });
      // This won't work for DDL - we need a different approach
    } catch {
      // Expected - PostgREST can't run DDL
    }
  }

  // The Supabase JS client can't run raw DDL.
  // We need to use the Supabase Management API (requires access token)
  // or connect directly via pg.
  // Let's try the pg approach:

  console.log("\n⚠️  The Supabase JS client can't run DDL (CREATE TABLE, DROP TABLE).");
  console.log("   We need to use a direct Postgres connection.\n");
  console.log("   Attempting connection via DATABASE_URL...\n");

  // Build the database URL from the Supabase project ref
  const projectRef = SUPABASE_URL.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error("❌ Could not extract project ref from SUPABASE_URL");
    process.exit(1);
  }

  // Direct Postgres connection to Supabase
  // Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("  To run this migration, you need your Supabase database password.");
    console.log("  You can find it at:");
    console.log(`  https://supabase.com/dashboard/project/${projectRef}/settings/database`);
    console.log("");
    console.log("  Then run:");
    console.log(`  SUPABASE_DB_PASSWORD=your-password npx tsx --env-file=.env.local scripts/run-migration.ts`);
    console.log("");
    console.log("  — OR —");
    console.log("");
    console.log("  Copy the SQL below and paste it into the Supabase SQL Editor:");
    console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");

    // Print the full migration SQL
    const schemaSQL = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf-8");
    const fullSQL = `-- ============================================================================
-- STEP 1: Drop old tables and functions
-- ============================================================================
${dropStatements.map(s => s + ";").join("\n")}

-- ============================================================================
-- STEP 2: Create new schema
-- ============================================================================
${schemaSQL}`;

    console.log(fullSQL);
    process.exit(0);
  }

  // If we have the password, connect directly via pg
  const { default: pg } = await import("pg");
  const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

  console.log(`   Connecting to Postgres...`);
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log("   ✅ Connected to Postgres\n");

    // Step 1: Drop old objects
    console.log("━━━ Step 1: Dropping old tables and functions ━━━");
    for (const stmt of dropStatements) {
      const objName = stmt.match(/(?:table|function)\s+(?:if\s+exists\s+)?(\w+)/)?.[1] || "unknown";
      try {
        await client.query(stmt);
        console.log(`   ✅ Dropped: ${objName}`);
      } catch (err: unknown) {
        const pgErr = err as { message?: string };
        console.log(`   ⚠️  ${objName}: ${pgErr.message || "unknown error"}`);
      }
    }

    // Step 2: Run the full schema
    console.log("\n━━━ Step 2: Creating new schema ━━━");
    const schemaSQL = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf-8");

    // Split on semicolons but respect dollar-quoted strings (for function bodies)
    // Run as one big transaction
    try {
      await client.query("BEGIN");
      await client.query(schemaSQL);
      await client.query("COMMIT");
      console.log("   ✅ Schema created successfully");
    } catch (err: unknown) {
      await client.query("ROLLBACK");
      const pgErr = err as { message?: string; detail?: string };
      console.error(`   ❌ Schema creation failed: ${pgErr.message}`);
      if (pgErr.detail) console.error(`      Detail: ${pgErr.detail}`);
      process.exit(1);
    }

    // Step 3: Verify
    console.log("\n━━━ Step 3: Verifying migration ━━━");
    const tables = ["providers", "charges", "payer_rates", "payers", "saved_searches"];
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT count(*) FROM ${table}`);
        console.log(`   ✅ Table '${table}' exists (${res.rows[0].count} rows)`);
      } catch (err: unknown) {
        const pgErr = err as { message?: string };
        console.error(`   ❌ Table '${table}' missing: ${pgErr.message}`);
      }
    }

    // Verify functions
    const functions = ["search_charges_nearby", "search_charges_by_description"];
    for (const fn of functions) {
      try {
        const res = await client.query(
          `SELECT routine_name FROM information_schema.routines WHERE routine_name = $1 AND routine_schema = 'public'`,
          [fn]
        );
        if (res.rows.length > 0) {
          console.log(`   ✅ Function '${fn}' exists`);
        } else {
          console.error(`   ❌ Function '${fn}' not found`);
        }
      } catch (err: unknown) {
        const pgErr = err as { message?: string };
        console.error(`   ❌ Function check failed: ${pgErr.message}`);
      }
    }

    // Verify PostGIS
    try {
      const res = await client.query("SELECT PostGIS_Version()");
      console.log(`   ✅ PostGIS version: ${res.rows[0].postgis_version}`);
    } catch {
      console.log("   ⚠️  PostGIS not available (will be enabled on first use)");
    }

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║   ✅ Migration complete!                  ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`\nView your tables at:`);
    console.log(`https://supabase.com/dashboard/project/${projectRef}/editor\n`);

  } catch (err: unknown) {
    const pgErr = err as { message?: string };
    console.error(`❌ Connection failed: ${pgErr.message}`);
    console.log("\nMake sure your database password is correct.");
    console.log(`Find it at: https://supabase.com/dashboard/project/${projectRef}/settings/database`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
