const XLSX = require("/tmp/xlsx-temp/node_modules/xlsx");
const { Database } = require("duckdb-async");
const fs = require("fs");

async function main() {
  // 1. Parse CMS top 200
  const wb = XLSX.readFile("/Users/chrispratt/Downloads/top-200-level-i-cpt-codes-ranked-by-charges-incurred-year-incurred-year.xlsx");
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const cms200 = data.map(r => String(r["__EMPTY"] || "").trim()).filter(c => /^\d{5}$/.test(c));

  // 2. Load top 500 + CMS 70
  const top500 = require("./top-codes.json");
  const cms70 = ["90832","90834","90837","90846","90847","90853","99203","99204","99205","99243","99244","99385","99386","80048","80053","80055","80061","80069","80076","81000","81001","81002","81003","84153","84154","84443","85025","85027","85610","85730","70450","70553","72110","72148","72193","73721","74177","76700","76805","76830","77065","77066","77067","19120","29826","29881","42820","43235","43239","45378","45380","45385","45391","47562","49505","55700","55866","59400","59510","59610","62322","62323","64483","66821","66984","93000","93452","95810","97110"];

  // 3. Merge
  const all = [...new Set([...top500, ...cms70, ...cms200])];
  console.log(`Top 500: ${top500.length} | CMS 70: ${cms70.length} | CMS 200: ${cms200.length}`);
  console.log(`Combined unique codes: ${all.length}`);
  console.log(`New from CMS 200: ${cms200.filter(c => !new Set([...top500, ...cms70]).has(c)).length}`);

  // 4. Query total size
  const db = await Database.create("mrf_lake.duckdb", { access_mode: "READ_ONLY" });
  await db.run('SET memory_limit = "4GB"');
  await db.run("SET threads = 2");

  const codeList = all.map(c => `'${c}'`).join(",");
  const r = await db.all(`SELECT COUNT(*) AS rows, COUNT(DISTINCT hospital_id) AS hospitals FROM standard_charges WHERE (cpt IN (${codeList}) OR hcpcs IN (${codeList})) AND (setting IS NULL OR LOWER(setting) != 'inpatient')`);

  const rows = Number(r[0].rows);
  console.log(`\nRows: ${rows.toLocaleString()}`);
  console.log(`Hospitals: ${Number(r[0].hospitals)}`);
  console.log(`Est size: ${(rows * 300 / 1e9).toFixed(1)}GB`);

  // 5. Save
  fs.writeFileSync("final-codes.json", JSON.stringify(all.sort(), null, 2));
  console.log(`\nSaved ${all.length} codes to final-codes.json`);
  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
