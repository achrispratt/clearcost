const fs = require("fs");

// Parse FAIR Health codes from the pasted text
const text = fs.readFileSync("/Users/chrispratt/clearcost/lib/data/fairhealth-raw.txt", "utf8");
const matches = text.match(/CPT CODE:\s*([A-Z0-9]+)/g) || [];
const fairCodes = [...new Set(matches.map(m => m.replace("CPT CODE: ", "").trim()))];

// Load our current set
const finalCodes = new Set(require("./final-codes.json"));

const missing = fairCodes.filter(c => !finalCodes.has(c));
const overlap = fairCodes.filter(c => finalCodes.has(c));

console.log(`FAIR Health unique codes: ${fairCodes.length}`);
console.log(`Already in our 675: ${overlap.length}`);
console.log(`Missing: ${missing.length}`);
console.log(`\nMissing codes:`);
missing.forEach(c => console.log(`  ${c}`));

// Merge and save
const merged = [...new Set([...finalCodes, ...fairCodes])].sort();
console.log(`\nMerged total: ${merged.length} codes`);
fs.writeFileSync("final-codes.json", JSON.stringify(merged, null, 2));
console.log("Saved to final-codes.json");
