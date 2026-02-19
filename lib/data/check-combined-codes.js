const XLSX = require("/tmp/xlsx-temp/node_modules/xlsx");
const { Database } = require("duckdb-async");

async function main() {
  const workbook = XLSX.readFile("/tmp/cms-top-200-cpt.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  const cms200 = [];
  for (const row of data) {
    const code = String(row["__EMPTY"] || "").trim();
    if (/^\d{5}$/.test(code)) cms200.push(code);
  }
  console.log("CMS Top 200 extracted:", cms200.length);

  const top500 = require("./top-codes.json");
  const cms70 = ["90832","90834","90837","90846","90847","90853","99203","99204","99205","99243","99244","99385","99386","80048","80053","80055","80061","80069","80076","81000","81001","81002","81003","84153","84154","84443","85025","85027","85610","85730","70450","70553","72110","72148","72193","73721","74177","76700","76805","76830","77065","77066","77067","19120","29826","29881","42820","43235","43239","45378","45380","45385","45391","47562","49505","55700","55866","59400","59510","59610","62322","62323","64483","66821","66984","93000","93452","95810","97110"];

  const current544 = new Set([...top500, ...cms70]);
  const newCodes = cms200.filter(c => !current544.has(c));
  const allCodes = new Set([...current544, ...cms200]);

  console.log("Already in 544:", cms200.length - newCodes.length);
  console.log("New codes from CMS 200:", newCodes.length);
  console.log("Total combined unique:", allCodes.size);

  const db = await Database.create("mrf_lake.duckdb", { access_mode: "READ_ONLY" });
  await db.run('SET memory_limit = "4GB"');
  await db.run("SET threads = 2");

  console.log("\nNew codes from CMS 200 not in our current set:");
  let totalNewRows = 0;
  for (const code of newCodes) {
    const r = await db.all(
      `SELECT COUNT(DISTINCT hospital_id) AS h, COUNT(*) AS rows
       FROM standard_charges
       WHERE (cpt = '${code}' OR hcpcs = '${code}')
         AND (setting IS NULL OR LOWER(setting) != 'inpatient')`
    );
    const hosp = Number(r[0].h);
    const rows = Number(r[0].rows);
    totalNewRows += rows;
    console.log(`  ${code}: ${hosp} hospitals, ${rows.toLocaleString()} rows`);
  }

  console.log(`\nTotal new rows from CMS 200: ${totalNewRows.toLocaleString()}`);

  // Final combined query
  const codeList = [...allCodes].map(c => `'${c}'`).join(",");
  const combined = await db.all(
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT hospital_id) AS hospitals
     FROM standard_charges
     WHERE (cpt IN (${codeList}) OR hcpcs IN (${codeList}))
       AND (setting IS NULL OR LOWER(setting) != 'inpatient')`
  );

  const totalRows = Number(combined[0].rows);
  console.log(`\n=== FINAL: Top 500 + CMS 70 + CMS 200 ===`);
  console.log(`Unique codes: ${allCodes.size}`);
  console.log(`Total rows: ${totalRows.toLocaleString()}`);
  console.log(`Hospitals: ${Number(combined[0].hospitals)}`);
  console.log(`Est size: ${(totalRows * 300 / 1e9).toFixed(1)}GB`);

  // Save final code list
  const fs = require("fs");
  fs.writeFileSync("final-codes.json", JSON.stringify([...allCodes].sort(), null, 2));
  console.log(`\nSaved to final-codes.json`);

  await db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
