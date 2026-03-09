/**
 * Investigate providers missing city data.
 * Usage: npx tsx --env-file=.env.local scripts/investigate-missing-city.ts
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  // 1. Count providers missing city (NULL or empty)
  const { count: nullCity } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .or("city.is.null,city.eq.");

  // 2. Count providers with literal "null" string in city
  const { count: literalNullCity } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("city", "null");

  // 3. Count providers with literal "null" in other fields
  const { count: literalNullState } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("state", "null");

  const { count: literalNullAddress } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("address", "null");

  const { count: literalNullZip } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .eq("zip", "null");

  console.log("\n=== Literal 'null' string analysis ===");
  console.log(`city = 'null':    ${literalNullCity}`);
  console.log(`state = 'null':   ${literalNullState}`);
  console.log(`address = 'null': ${literalNullAddress}`);
  console.log(`zip = 'null':     ${literalNullZip}`);

  console.log("\n=== NULL/empty city ===");
  console.log(`city IS NULL or empty: ${nullCity}`);

  // 4. Sample providers missing city — check what other fields they have
  const { data: sample } = await supabase
    .from("providers")
    .select("id,name,address,city,state,zip,lat,lng")
    .or("city.is.null,city.eq.,city.eq.null")
    .limit(20);

  console.log("\n=== Sample providers missing city (first 20) ===");
  for (const p of sample ?? []) {
    console.log(
      `  ${p.name?.slice(0, 40)?.padEnd(42)} | addr=${p.address?.slice(0, 30) ?? "NULL"} | city=${p.city ?? "NULL"} | st=${p.state ?? "NULL"} | zip=${p.zip ?? "NULL"} | lat=${p.lat != null ? "YES" : "NO"} | lng=${p.lng != null ? "YES" : "NO"}`
    );
  }

  // 5. How many missing-city providers have charges?
  const { data: missingCityIds } = await supabase
    .from("providers")
    .select("id")
    .or("city.is.null,city.eq.,city.eq.null");

  if (missingCityIds) {
    // Check in batches of 100
    let withCharges = 0;
    let withoutCharges = 0;
    const batchSize = 100;
    for (let i = 0; i < missingCityIds.length; i += batchSize) {
      const batch = missingCityIds.slice(i, i + batchSize).map((r) => r.id);
      const { count } = await supabase
        .from("charges")
        .select("id", { count: "exact", head: true })
        .in("provider_id", batch);
      if (count && count > 0) {
        // Count individual providers with charges in this batch
        for (const pid of batch) {
          const { count: pCount } = await supabase
            .from("charges")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", pid)
            .limit(1);
          if (pCount && pCount > 0) withCharges++;
          else withoutCharges++;
        }
      } else {
        withoutCharges += batch.length;
      }
    }
    console.log(`\n=== Missing-city providers with charges ===`);
    console.log(`Total missing city: ${missingCityIds.length}`);
    console.log(`With charges:    ${withCharges}`);
    console.log(`Without charges: ${withoutCharges}`);
  }

  // 6. How many have coordinates despite missing city?
  const { count: missingCityWithCoords } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .or("city.is.null,city.eq.,city.eq.null")
    .not("lat", "is", null)
    .not("lng", "is", null);

  const { count: missingCityWithoutCoords } = await supabase
    .from("providers")
    .select("id", { count: "exact", head: true })
    .or("city.is.null,city.eq.,city.eq.null")
    .or("lat.is.null,lng.is.null");

  console.log(`\n=== Missing-city providers: geocoding status ===`);
  console.log(`With coordinates:    ${missingCityWithCoords}`);
  console.log(`Without coordinates: ${missingCityWithoutCoords}`);

  // 7. State distribution of missing-city providers
  const { data: stateDist } = await supabase
    .from("providers")
    .select("state")
    .or("city.is.null,city.eq.,city.eq.null");

  if (stateDist) {
    const stateMap = new Map<string, number>();
    for (const row of stateDist) {
      const st = row.state ?? "(NULL)";
      stateMap.set(st, (stateMap.get(st) ?? 0) + 1);
    }
    const sorted = [...stateMap.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n=== Missing-city providers by state (top 15) ===`);
    for (const [state, count] of sorted.slice(0, 15)) {
      console.log(`  ${state.padEnd(8)} ${count}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
