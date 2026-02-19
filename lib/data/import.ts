/**
 * Data pipeline for importing hospital pricing from DoltHub.
 * Run with: npx tsx lib/data/import.ts
 *
 * Uses the dolthub/transparency-in-pricing dataset (V4).
 * Fetches completed hospitals in the NY/NJ/CT metro area,
 * then pulls pricing data for our target CPT codes.
 */

import { createClient } from "@supabase/supabase-js";

const DOLTHUB_API = "https://www.dolthub.com/api/v1alpha1";
const DOLTHUB_REPO = "dolthub/transparency-in-pricing";

// Our target CPT codes from codes.ts
const TARGET_CPT_CODES = [
  "70551", "70553", "73721", "73723", "73221", "72148", "72141",
  "74177", "71260", "71046", "73030", "73560",
  "80053", "85025", "80061", "84443", "81001",
  "76856", "77067",
  "99213", "99214", "99203", "99204",
  "95004", "93306", "95810", "97161",
  "29881", "27447", "27130", "47562", "58661",
  "45378", "45380", "45385", "43239",
];

// Hardcoded geocoding for hospitals we find — DoltHub doesn't provide lat/lng.
// For MVP, we geocode the addresses manually. This map is populated as we discover hospitals.
const HOSPITAL_GEOCODES: Record<string, { lat: number; lng: number }> = {
  // Manhattan
  "330119": { lat: 40.7736, lng: -73.9609 }, // Lenox Hill Hospital
  "330024": { lat: 40.7900, lng: -73.9526 }, // Mount Sinai Hospital
  "330101": { lat: 40.7644, lng: -73.9553 }, // NY Presbyterian / Weill Cornell
  "330214": { lat: 40.8408, lng: -73.9418 }, // NY Presbyterian / Columbia
  "330025": { lat: 40.7361, lng: -73.9741 }, // NYU Langone - Tisch
  "330270": { lat: 40.7362, lng: -73.9745 }, // NYU Langone Orthopedic
  "330182": { lat: 40.7358, lng: -74.0004 }, // Lenox Health Greenwich Village
  // Brooklyn
  "330396": { lat: 40.6551, lng: -73.9460 }, // SUNY Downstate
  "330019": { lat: 40.6714, lng: -73.9796 }, // NY Methodist
  // Bronx
  "330059": { lat: 40.8815, lng: -73.8785 }, // Montefiore Medical Center
  "330127": { lat: 40.8506, lng: -73.8449 }, // Jacobi Medical Center
  // Queens
  "330055": { lat: 40.7499, lng: -73.8747 }, // Elmhurst Hospital
  // Staten Island
  "330160": { lat: 40.5836, lng: -74.1494 }, // Staten Island University Hospital
  // NJ
  "310002": { lat: 40.7440, lng: -74.1723 }, // University Hospital Newark
  "310014": { lat: 40.7150, lng: -74.0623 }, // Jersey City Medical Center
  "310074": { lat: 40.8604, lng: -74.2263 }, // St. Joseph's Health
  "310021": { lat: 40.5490, lng: -74.3063 }, // Robert Wood Johnson University Hospital
  "310048": { lat: 40.6844, lng: -74.2362 }, // Newark Beth Israel
  "310075": { lat: 40.4849, lng: -74.2454 }, // Hackensack Meridian Raritan Bay
  "310001": { lat: 40.8861, lng: -74.0639 }, // Hackensack University Medical Center
  // CT
  "070001": { lat: 41.3041, lng: -72.9343 }, // Yale New Haven Hospital
  "070010": { lat: 41.7621, lng: -72.6739 }, // Hartford Hospital
  "070022": { lat: 41.2074, lng: -73.1952 }, // Bridgeport Hospital
  "070028": { lat: 41.0507, lng: -73.5389 }, // Stamford Hospital
};

interface DoltHubResponse {
  query_execution_status: string;
  rows: Record<string, string | number | null>[];
  schema: { columnName: string; columnType: string }[];
}

async function queryDoltHub(sql: string): Promise<DoltHubResponse> {
  const url = `${DOLTHUB_API}/${DOLTHUB_REPO}?q=${encodeURIComponent(sql)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DoltHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.query_execution_status === "Error") {
    throw new Error(`DoltHub query error: ${data.query_execution_message}`);
  }

  return data;
}

async function fetchCompletedHospitals() {
  console.log("Fetching completed hospitals in NY/NJ/CT...");

  const sql = `
    SELECT id, name, addr, city, state, zip, phone, category
    FROM completed_hospitals
    WHERE state IN ('NY', 'NJ', 'CT')
    ORDER BY state, city, name
  `;

  const result = await queryDoltHub(sql);
  console.log(`Found ${result.rows.length} completed hospitals in NY/NJ/CT`);
  return result.rows;
}

function mapProviderType(category: string | null): string {
  if (!category) return "hospital";
  const lower = category.toLowerCase();
  if (lower.includes("critical access")) return "hospital";
  if (lower.includes("children")) return "hospital";
  if (lower.includes("psychiatric")) return "hospital";
  if (lower.includes("rehabilitation")) return "hospital";
  if (lower.includes("short term")) return "hospital";
  if (lower.includes("long term")) return "hospital";
  return "hospital";
}

async function fetchPricingForHospital(hospitalId: string, hospitalName: string) {
  const cptList = TARGET_CPT_CODES.map((c) => `'${c}'`).join(",");

  // Fetch cash prices
  const cashSql = `
    SELECT hospital_id, hcpcs_cpt, description, rate_category,
           standard_charge, billing_class, setting
    FROM rate
    WHERE hospital_id = '${hospitalId}'
      AND hcpcs_cpt IN (${cptList})
      AND rate_category IN ('cash', 'gross')
      AND standard_charge IS NOT NULL
      AND standard_charge > 0
    LIMIT 500
  `;

  let cashRows: Record<string, string | number | null>[] = [];
  try {
    const cashResult = await queryDoltHub(cashSql);
    cashRows = cashResult.rows;
    console.log(`  ${hospitalName}: ${cashRows.length} cash/gross prices`);
  } catch (err) {
    console.warn(`  ${hospitalName}: cash query failed, skipping`);
  }

  // Fetch min/max prices
  const minMaxSql = `
    SELECT hospital_id, hcpcs_cpt, description, rate_category,
           standard_charge
    FROM rate
    WHERE hospital_id = '${hospitalId}'
      AND hcpcs_cpt IN (${cptList})
      AND rate_category IN ('min', 'max')
      AND standard_charge IS NOT NULL
      AND standard_charge > 0
    LIMIT 500
  `;

  let minMaxRows: Record<string, string | number | null>[] = [];
  try {
    const minMaxResult = await queryDoltHub(minMaxSql);
    minMaxRows = minMaxResult.rows;
    console.log(`  ${hospitalName}: ${minMaxRows.length} min/max prices`);
  } catch {
    console.warn(`  ${hospitalName}: min/max query failed, skipping`);
  }

  // Fetch negotiated rates (top payers only, limited)
  const negotiatedSql = `
    SELECT hospital_id, hcpcs_cpt, description, rate_category,
           payer_name, plan_name, standard_charge
    FROM rate
    WHERE hospital_id = '${hospitalId}'
      AND hcpcs_cpt IN (${cptList})
      AND rate_category = 'negotiated'
      AND standard_charge IS NOT NULL
      AND standard_charge > 0
      AND payer_name IS NOT NULL
    LIMIT 1000
  `;

  let negotiatedRows: Record<string, string | number | null>[] = [];
  try {
    const negotiatedResult = await queryDoltHub(negotiatedSql);
    negotiatedRows = negotiatedResult.rows;
    console.log(`  ${hospitalName}: ${negotiatedRows.length} negotiated rates`);
  } catch {
    console.warn(`  ${hospitalName}: negotiated query failed, skipping`);
  }

  return { cashRows, minMaxRows, negotiatedRows };
}

async function importHospitalPricing() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Make sure .env.local is loaded. Run with:\n" +
        "  npx tsx --env-file=.env.local lib/data/import.ts"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("=== ClearCost Data Import ===\n");

  // Step 1: Fetch completed hospitals
  const hospitals = await fetchCompletedHospitals();

  if (hospitals.length === 0) {
    console.log("No completed hospitals found. Exiting.");
    return;
  }

  // Step 2: Insert providers into Supabase
  console.log("\nInserting providers...");
  const providerIdMap: Record<string, string> = {}; // DoltHub ID → Supabase UUID

  for (const hospital of hospitals) {
    const doltId = hospital.id as string;
    const geocode = HOSPITAL_GEOCODES[doltId];

    if (!geocode) {
      console.warn(`  Skipping ${hospital.name} (${doltId}) — no geocode available`);
      continue;
    }

    const { data, error } = await supabase
      .from("providers")
      .upsert(
        {
          name: hospital.name as string,
          address: (hospital.addr as string) || "",
          city: (hospital.city as string) || "",
          state: (hospital.state as string) || "",
          zip: (hospital.zip as string) || "",
          lat: geocode.lat,
          lng: geocode.lng,
          phone: hospital.phone as string | null,
          provider_type: mapProviderType(hospital.category as string | null),
          npi: doltId,
        },
        { onConflict: "npi" }
      )
      .select("id")
      .single();

    if (error) {
      console.error(`  Error inserting ${hospital.name}: ${error.message}`);
      continue;
    }

    providerIdMap[doltId] = data.id;
    console.log(`  Inserted: ${hospital.name} (${hospital.city}, ${hospital.state})`);
  }

  const providerCount = Object.keys(providerIdMap).length;
  console.log(`\nInserted ${providerCount} providers\n`);

  if (providerCount === 0) {
    console.log("No providers inserted. Exiting.");
    return;
  }

  // Step 3: Fetch and insert pricing data for each provider
  console.log("Fetching pricing data from DoltHub...\n");
  let totalPrices = 0;
  let totalNegotiated = 0;

  for (const [doltId, supabaseId] of Object.entries(providerIdMap)) {
    const hospital = hospitals.find((h) => h.id === doltId);
    const hospitalName = (hospital?.name as string) || doltId;

    const { cashRows, minMaxRows, negotiatedRows } =
      await fetchPricingForHospital(doltId, hospitalName);

    // Build a map of CPT code → pricing info
    const priceMap: Record<
      string,
      {
        description: string;
        cashPrice: number | null;
        grossPrice: number | null;
        minPrice: number | null;
        maxPrice: number | null;
      }
    > = {};

    // Process cash/gross prices
    for (const row of cashRows) {
      const cpt = row.hcpcs_cpt as string;
      if (!priceMap[cpt]) {
        priceMap[cpt] = {
          description: (row.description as string) || cpt,
          cashPrice: null,
          grossPrice: null,
          minPrice: null,
          maxPrice: null,
        };
      }
      const charge = Number(row.standard_charge);
      if (row.rate_category === "cash") {
        priceMap[cpt].cashPrice = charge;
      } else if (row.rate_category === "gross") {
        priceMap[cpt].grossPrice = charge;
      }
    }

    // Process min/max
    for (const row of minMaxRows) {
      const cpt = row.hcpcs_cpt as string;
      if (!priceMap[cpt]) {
        priceMap[cpt] = {
          description: (row.description as string) || cpt,
          cashPrice: null,
          grossPrice: null,
          minPrice: null,
          maxPrice: null,
        };
      }
      const charge = Number(row.standard_charge);
      if (row.rate_category === "min") priceMap[cpt].minPrice = charge;
      if (row.rate_category === "max") priceMap[cpt].maxPrice = charge;
    }

    // Insert prices
    for (const [cpt, info] of Object.entries(priceMap)) {
      // Use cash price if available, otherwise fall back to gross
      const displayPrice = info.cashPrice ?? info.grossPrice;

      const { data: priceData, error: priceError } = await supabase
        .from("prices")
        .insert({
          provider_id: supabaseId,
          cpt_code: cpt,
          cpt_description: info.description,
          cash_price: displayPrice,
          min_price: info.minPrice,
          max_price: info.maxPrice,
          source: "dolthub_transparency_in_pricing",
        })
        .select("id")
        .single();

      if (priceError) {
        console.error(`  Error inserting price for ${cpt}: ${priceError.message}`);
        continue;
      }

      totalPrices++;

      // Insert negotiated rates for this CPT code
      const cptNegotiated = negotiatedRows.filter(
        (r) => r.hcpcs_cpt === cpt
      );

      // Deduplicate by payer — keep the first rate per payer for this CPT
      const seenPayers = new Set<string>();
      const uniqueNegotiated = cptNegotiated.filter((r) => {
        const key = `${r.payer_name}`;
        if (seenPayers.has(key)) return false;
        seenPayers.add(key);
        return true;
      });

      if (uniqueNegotiated.length > 0 && priceData) {
        const rates = uniqueNegotiated.slice(0, 10).map((r) => ({
          price_id: priceData.id,
          payer_name: (r.payer_name as string) || "Unknown",
          plan_name: r.plan_name as string | null,
          rate: Number(r.standard_charge),
        }));

        const { error: rateError } = await supabase
          .from("negotiated_rates")
          .insert(rates);

        if (rateError) {
          console.error(`  Error inserting negotiated rates: ${rateError.message}`);
        } else {
          totalNegotiated += rates.length;
        }
      }
    }

    // Be polite to the DoltHub API
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n=== Import Complete ===");
  console.log(`Providers: ${providerCount}`);
  console.log(`Prices: ${totalPrices}`);
  console.log(`Negotiated rates: ${totalNegotiated}`);
}

importHospitalPricing().catch(console.error);

export { importHospitalPricing };
