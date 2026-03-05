/**
 * Run the ClearCost schema migration using the Supabase Management API.
 * This uses the service_role key to execute SQL via Supabase's built-in SQL execution.
 *
 * Usage: npx tsx --env-file=.env.local scripts/run-migration-api.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const projectRef = SUPABASE_URL.match(/https:\/\/(.+)\.supabase\.co/)?.[1];

async function executeSQLViaRPC(sql: string, label: string): Promise<boolean> {
  console.log(`\n🔄 ${label}...`);

  // Supabase exposes a pg_net-based SQL execution via the PostgREST interface
  // We can use a custom RPC function, or we can use the built-in query endpoint
  // The simplest approach: use the Supabase client's from() to check tables exist,
  // but for DDL we need the SQL API.

  // Try the /pg/ endpoint (Supabase SQL API for service role)
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (response.ok) {
    const result = await response.json();
    console.log(`   ✅ ${label} — success`);
    return true;
  }

  // Try alternate endpoint
  const response2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ sql_text: sql }),
  });

  if (response2.ok) {
    console.log(`   ✅ ${label} — success (via RPC)`);
    return true;
  }

  const errorText = await response.text();
  const errorText2 = await response2.text();
  console.log(`   ❌ ${label} — failed`);
  console.log(
    `      /pg/query: ${response.status} ${errorText.substring(0, 200)}`
  );
  console.log(
    `      /rpc/exec_sql: ${response2.status} ${errorText2.substring(0, 200)}`
  );
  return false;
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   ClearCost Database Migration (API)     ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n📌 Target: ${SUPABASE_URL}`);
  console.log(`📌 Project: ${projectRef}\n`);

  // Try a simple query first to verify connectivity
  console.log("━━━ Testing connectivity ━━━");
  const testResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  console.log(`   REST API: ${testResponse.status} ${testResponse.statusText}`);

  // Step 1: Drop old tables
  console.log("\n━━━ Step 1: Drop old tables ━━━");
  const dropSQL = `
    drop function if exists search_prices_nearby cascade;
    drop function if exists search_charges_nearby cascade;
    drop function if exists search_charges_by_description cascade;
    drop table if exists negotiated_rates cascade;
    drop table if exists payer_rates cascade;
    drop table if exists prices cascade;
    drop table if exists charges cascade;
    drop table if exists hospitals cascade;
    drop table if exists providers cascade;
    drop table if exists payers cascade;
    drop table if exists saved_searches cascade;
  `;
  await executeSQLViaRPC(dropSQL, "Drop old tables");

  // Step 2: Run schema
  console.log("\n━━━ Step 2: Create new schema ━━━");
  const schemaSQL = readFileSync(
    join(process.cwd(), "supabase", "schema.sql"),
    "utf-8"
  );
  await executeSQLViaRPC(schemaSQL, "Create schema");

  // Step 3: Verify by checking tables via REST
  console.log("\n━━━ Step 3: Verify tables ━━━");
  const tables = [
    "providers",
    "charges",
    "payer_rates",
    "payers",
    "saved_searches",
  ];
  for (const table of tables) {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=count&limit=0`,
      {
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: "count=exact",
        },
      }
    );
    if (resp.ok) {
      const count = resp.headers.get("content-range");
      console.log(`   ✅ ${table} — exists (${count})`);
    } else {
      console.log(`   ❌ ${table} — ${resp.status} ${resp.statusText}`);
    }
  }

  console.log(
    `\n📎 View tables: https://supabase.com/dashboard/project/${projectRef}/editor`
  );
}

main().catch(console.error);
