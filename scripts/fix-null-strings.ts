/**
 * Fix literal "null" strings in provider address fields.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/fix-null-strings.ts --dry-run   # diagnostic only
 *   npx tsx --env-file=.env.local scripts/fix-null-strings.ts             # apply fix
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const dryRun = process.argv.includes("--dry-run");

const FIELDS = ["address", "city", "state", "zip"] as const;

async function countLiteralNulls() {
  const counts: Record<string, number> = {};
  for (const field of FIELDS) {
    const { count } = await supabase
      .from("providers")
      .select("id", { count: "exact", head: true })
      .ilike(field, "null");
    counts[field] = count ?? 0;
  }
  return counts;
}

async function main() {
  console.log(
    `\nMode: ${dryRun ? "DRY RUN (diagnostic only)" : "LIVE (will update)"}\n`
  );

  // Before counts
  const before = await countLiteralNulls();
  console.log("=== Literal 'null' strings (case-insensitive) ===");
  let total = 0;
  for (const field of FIELDS) {
    console.log(`  ${field.padEnd(10)} ${before[field]}`);
    total += before[field];
  }
  console.log(`  ${"TOTAL".padEnd(10)} ${total}`);

  if (total === 0) {
    console.log("\nNo literal 'null' strings found. Nothing to fix.");
    return;
  }

  if (dryRun) {
    // Sample affected rows
    const { data: sample } = await supabase
      .from("providers")
      .select("name,address,city,state,zip")
      .or("address.ilike.null,city.ilike.null,state.ilike.null,zip.ilike.null")
      .limit(10);

    console.log("\n=== Sample affected providers ===");
    for (const p of sample ?? []) {
      console.log(
        `  ${p.name?.slice(0, 40)?.padEnd(42)} | addr=${p.address ?? "NULL"} | city=${p.city ?? "NULL"} | st=${p.state ?? "NULL"} | zip=${p.zip ?? "NULL"}`
      );
    }
    console.log("\nRe-run without --dry-run to apply fix.");
    return;
  }

  // Live mode: update via Supabase RPC (raw SQL)
  console.log("\nApplying fix...");
  const { error } = await supabase.rpc("exec_sql", {
    query: `
      UPDATE providers
      SET
        address = CASE WHEN LOWER(address) = 'null' THEN NULL ELSE address END,
        city    = CASE WHEN LOWER(city)    = 'null' THEN NULL ELSE city END,
        state   = CASE WHEN LOWER(state)   = 'null' THEN NULL ELSE state END,
        zip     = CASE WHEN LOWER(zip)     = 'null' THEN NULL ELSE zip END
      WHERE LOWER(address) = 'null'
         OR LOWER(city) = 'null'
         OR LOWER(state) = 'null'
         OR LOWER(zip) = 'null';
    `,
  });

  if (error) {
    // Fallback: update field-by-field via Supabase client (parallel)
    console.log("  exec_sql RPC not available, updating field-by-field...");
    const batchSize = 200;

    async function fixField(field: string, count: number) {
      if (count === 0) return;
      const { data: rows } = await supabase
        .from("providers")
        .select("id")
        .ilike(field, "null");
      if (!rows || rows.length === 0) return;

      for (let i = 0; i < rows.length; i += batchSize) {
        const ids = rows.slice(i, i + batchSize).map((r) => r.id);
        const { error: updateErr } = await supabase
          .from("providers")
          .update({ [field]: null })
          .in("id", ids);
        if (updateErr) {
          console.error(`  Error updating ${field}:`, updateErr.message);
        }
      }
      console.log(`  Fixed ${rows.length} rows for '${field}'`);
    }

    await Promise.all(FIELDS.map((f) => fixField(f, before[f])));
  } else {
    console.log("  SQL UPDATE applied successfully.");
  }

  // After counts
  const after = await countLiteralNulls();
  console.log("\n=== After cleanup ===");
  for (const field of FIELDS) {
    console.log(`  ${field.padEnd(10)} ${after[field]}`);
  }

  // Providers missing coordinates
  const { count: noCoords } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .or("lat.is.null,lng.is.null");

  console.log(`\n=== Providers missing coordinates: ${noCoords} ===`);

  // Sample unmappable providers
  const { data: unmappable } = await supabase
    .from("providers")
    .select("name,address,city,state,zip")
    .or("lat.is.null,lng.is.null")
    .limit(10);

  if (unmappable && unmappable.length > 0) {
    console.log("\n=== Sample unmappable providers ===");
    for (const p of unmappable) {
      console.log(
        `  ${p.name?.slice(0, 40)?.padEnd(42)} | addr=${p.address ?? "NULL"} | city=${p.city ?? "NULL"} | st=${p.state ?? "NULL"} | zip=${p.zip ?? "NULL"}`
      );
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
