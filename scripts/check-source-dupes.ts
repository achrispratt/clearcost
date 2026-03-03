/**
 * Diagnostic: look at the FULL source Parquet rows for duplicates.
 * Are columns we don't import (charge_seq, additional_generic_notes,
 * all_codes, cdm, etc.) different across "duplicate" rows?
 */
import { Database } from "duckdb-async";

async function main() {
  const db = await Database.create("mrf_lake.duckdb", { access_mode: "READ_ONLY" });
  await db.run("SET memory_limit = '2GB'");
  await db.run("SET threads = 2");

  // Pick a simple X-ray code (73590 = X-ray lower leg) at a TX hospital
  // First find a TX hospital with duplicates for 73590
  console.log("=== Finding a TX hospital with 73590 duplicates ===\n");
  const hospitals = await db.all(`
    SELECT hospital_id, hospital_name, COUNT(*) as cnt
    FROM standard_charges
    WHERE hospital_state = 'TX'
      AND (cpt = '73590' OR hcpcs = '73590')
    GROUP BY hospital_id, hospital_name
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `);
  for (const h of hospitals as any[]) {
    console.log(`  id=${h.hospital_id} | ${h.hospital_name} | ${h.cnt} rows`);
  }

  if (hospitals.length === 0) {
    console.log("No duplicates found");
    await db.close();
    return;
  }

  const hid = (hospitals[0] as any).hospital_id;
  const hname = (hospitals[0] as any).hospital_name;

  // Show ALL columns for these "duplicate" rows
  console.log(`\n=== ALL columns for ${hname}, code 73590 ===\n`);
  const rows = await db.all(`
    SELECT * FROM standard_charges
    WHERE hospital_id = ${Number(hid)}
      AND (cpt = '73590' OR hcpcs = '73590')
    ORDER BY charge_id
  `);

  console.log(`Total rows: ${rows.length}\n`);

  // Show each row with ALL its columns
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i] as any;
    console.log(`--- Row ${i + 1} (charge_id=${r.charge_id}) ---`);
    console.log(`  charge_seq: ${r.charge_seq}`);
    console.log(`  description: ${r.description}`);
    console.log(`  cpt: ${r.cpt} | hcpcs: ${r.hcpcs}`);
    console.log(`  setting: ${r.setting} | billing_class: ${r.billing_class}`);
    console.log(`  gross_charge: ${r.gross_charge} | discounted_cash: ${r.discounted_cash}`);
    console.log(`  minimum: ${r.minimum} | maximum: ${r.maximum}`);
    console.log(`  avg_negotiated_rate: ${r.avg_negotiated_rate}`);
    console.log(`  min_negotiated_rate: ${r.min_negotiated_rate}`);
    console.log(`  max_negotiated_rate: ${r.max_negotiated_rate}`);
    console.log(`  payer_count: ${r.payer_count} | distinct_payer_count: ${r.distinct_payer_count}`);
    console.log(`  negotiated_rate_stddev: ${r.negotiated_rate_stddev}`);
    console.log(`  modifiers: ${r.modifiers}`);
    console.log(`  additional_generic_notes: ${r.additional_generic_notes}`);
    console.log(`  drug_unit: ${r.drug_unit} | drug_type: ${r.drug_type}`);
    console.log(`  rc: ${r.rc} | cdm: ${r.cdm} | ndc: ${r.ndc} | icd: ${r.icd}`);
    console.log(`  other_code1: ${r.other_code1} (${r.other_code1_type})`);
    console.log(`  other_code2: ${r.other_code2} (${r.other_code2_type})`);
    console.log(`  all_codes: ${r.all_codes}`);
    console.log(`  last_updated_on: ${r.last_updated_on}`);
    console.log(`  version: ${r.version}`);
    console.log();
  }

  if (rows.length > 8) {
    console.log(`  ... (${rows.length - 8} more rows)\n`);
  }

  // Check: which columns actually DIFFER across these rows?
  console.log("=== Column variance analysis ===\n");
  const allCols = Object.keys(rows[0] as any);
  for (const col of allCols) {
    const distinctVals = new Set(rows.map((r: any) => JSON.stringify(r[col])));
    if (distinctVals.size > 1) {
      console.log(`  ${col}: ${distinctVals.size} distinct values`);
      // Show first few
      const vals = [...distinctVals].slice(0, 5);
      for (const v of vals) {
        console.log(`    ${v}`);
      }
    }
  }

  // Also check J2250 (Midazolam) at a Kindred hospital
  console.log("\n\n=== Kindred Hospital, J2250 (Midazolam) ===\n");
  const kindred = await db.all(`
    SELECT hospital_id, hospital_name, COUNT(*) as cnt
    FROM standard_charges
    WHERE hospital_state = 'TX'
      AND hospital_name LIKE '%Kindred%Dallas%'
      AND (cpt = 'J2250' OR hcpcs = 'J2250')
    GROUP BY hospital_id, hospital_name
  `);
  if (kindred.length > 0) {
    const kid = (kindred[0] as any).hospital_id;
    console.log(`Hospital: ${(kindred[0] as any).hospital_name}, ${(kindred[0] as any).cnt} rows\n`);

    const krows = await db.all(`
      SELECT * FROM standard_charges
      WHERE hospital_id = ${Number(kid)}
        AND (cpt = 'J2250' OR hcpcs = 'J2250')
      ORDER BY charge_id
      LIMIT 5
    `);

    for (let i = 0; i < krows.length; i++) {
      const r = krows[i] as any;
      console.log(`--- Row ${i + 1} (charge_id=${r.charge_id}) ---`);
      console.log(`  charge_seq: ${r.charge_seq}`);
      console.log(`  description: ${r.description}`);
      console.log(`  cpt: ${r.cpt} | hcpcs: ${r.hcpcs}`);
      console.log(`  setting: ${r.setting} | billing_class: ${r.billing_class}`);
      console.log(`  gross_charge: ${r.gross_charge} | discounted_cash: ${r.discounted_cash}`);
      console.log(`  avg_negotiated_rate: ${r.avg_negotiated_rate}`);
      console.log(`  payer_count: ${r.payer_count}`);
      console.log(`  additional_generic_notes: ${r.additional_generic_notes}`);
      console.log(`  cdm: ${r.cdm} | rc: ${r.rc}`);
      console.log(`  all_codes: ${r.all_codes}`);
      console.log();
    }

    // Column variance for Kindred J2250
    const allKCols = Object.keys(krows[0] as any);
    const allKRows = await db.all(`
      SELECT * FROM standard_charges
      WHERE hospital_id = ${Number(kid)}
        AND (cpt = 'J2250' OR hcpcs = 'J2250')
      ORDER BY charge_id
    `);
    console.log("Column variance:");
    for (const col of allKCols) {
      const distinctVals = new Set(allKRows.map((r: any) => JSON.stringify(r[col])));
      if (distinctVals.size > 1) {
        console.log(`  ${col}: ${distinctVals.size} distinct values`);
        const vals = [...distinctVals].slice(0, 3);
        for (const v of vals) {
          console.log(`    ${v}`);
        }
      }
    }
  }

  await db.close();
  console.log("\nDone.");
}

// Must CWD to mrf_lake dir for DuckDB relative parquet paths
process.chdir("/Users/chrispratt/clearcost/lib/data/mrf_lake");
main().catch(console.error);
