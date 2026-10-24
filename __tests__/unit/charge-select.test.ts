import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Database } from "duckdb-async";
import { buildChargeSelect } from "@/lib/data/charge-select";

// Runs the real import query against a tiny in-memory copy of the Oria tables.
let db: Database;

const codeFilter =
  "(cpt IN ('33533','652') OR hcpcs IN ('33533','652') OR ms_drg IN ('33533','652'))";

beforeAll(async () => {
  db = await Database.create(":memory:");
  await db.run(`
    CREATE TABLE standard_charges (
      hospital_id INT, charge_id INT, description VARCHAR, gross_charge DOUBLE,
      discounted_cash DOUBLE, minimum DOUBLE, maximum DOUBLE, setting VARCHAR,
      billing_class VARCHAR, modifiers VARCHAR, cpt VARCHAR, hcpcs VARCHAR,
      ms_drg VARCHAR, rc VARCHAR, ndc VARCHAR, icd VARCHAR,
      avg_negotiated_rate DOUBLE, min_negotiated_rate DOUBLE,
      max_negotiated_rate DOUBLE, payer_count INT, hospital_state VARCHAR
    )`);
  await db.run(`
    CREATE TABLE standard_charge_details (
      hospital_id INT, charge_id INT, cpt VARCHAR, hcpcs VARCHAR, ms_drg VARCHAR,
      standard_charge_dollar DOUBLE, methodology_normalized VARCHAR,
      hospital_state VARCHAR
    )`);
  // 1: kidney transplant stay with per-diem, case-rate and fee-schedule payers
  // 2: stay where every payer is per diem
  // 3: surgeon CPT line (not a DRG) keeps Oria's stats
  // 4: an exact copy of 3 (same code, wording and prices)
  // 5: a line with no price at all
  await db.run(`
    INSERT INTO standard_charges VALUES
      (1, 1, 'Kidney transplant', 90000, NULL, NULL, NULL, 'inpatient', 'facility', NULL, NULL, NULL, '652', NULL, NULL, NULL, 12000, 4000, 40000, 4, 'TX'),
      (1, 2, 'Kidney transplant', 90000, NULL, NULL, NULL, 'inpatient', 'facility', NULL, NULL, NULL, '652', NULL, NULL, NULL, 4100, 4000, 4200, 2, 'TX'),
      (1, 3, 'CABG arterial', 9000, NULL, NULL, NULL, 'outpatient', 'professional', NULL, '33533', NULL, NULL, NULL, NULL, NULL, 5370, 5000, 6000, 3, 'TX'),
      (1, 4, 'CABG arterial', 9000, NULL, NULL, NULL, 'outpatient', 'professional', NULL, '33533', NULL, NULL, NULL, NULL, NULL, 5370, 5000, 6000, 3, 'TX'),
      (1, 5, 'CABG arterial', NULL, NULL, NULL, NULL, 'outpatient', 'professional', NULL, '33533', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 'TX'),
      (2, 1, 'Kidney transplant', 80000, NULL, NULL, NULL, 'inpatient', 'facility', NULL, NULL, NULL, '652', NULL, NULL, NULL, 3000, 3000, 3000, 1, 'WY')`);
  await db.run(`
    INSERT INTO standard_charge_details VALUES
      (1, 1, NULL, NULL, '652', 4000, 'per diem', 'TX'),
      (1, 1, NULL, NULL, '652', 4200, 'per diem', 'TX'),
      (1, 1, NULL, NULL, '652', 30000, 'case rate', 'TX'),
      (1, 1, NULL, NULL, '652', 40000, 'fee schedule', 'TX'),
      (1, 1, NULL, NULL, '652', NULL, 'percent of total billed charges', 'TX'),
      (1, 2, NULL, NULL, '652', 4000, 'per diem', 'TX'),
      (1, 2, NULL, NULL, '652', 4200, 'per diem', 'TX'),
      (1, 3, '33533', NULL, NULL, 5000, 'fee schedule', 'TX'),
      (2, 1, NULL, NULL, '652', 3000, 'case rate', 'WY')`);
});

afterAll(async () => {
  await db.close();
});

async function run(limit?: number) {
  const rows = await db.all(
    buildChargeSelect({ state: "TX", codeFilter, limit })
  );
  return new Map(rows.map((r) => [Number(r.charge_id), r]));
}

describe("buildChargeSelect", () => {
  it("prices a stay from whole-stay rates only, leaving out per diem", async () => {
    const stay = (await run()).get(1)!;
    expect(Number(stay.avg_negotiated_rate)).toBe(35000);
    expect(Number(stay.min_negotiated_rate)).toBe(30000);
    expect(Number(stay.max_negotiated_rate)).toBe(40000);
    expect(Number(stay.payer_count)).toBe(2);
  });

  it("leaves the stay unpriced when every payer rate is per diem", async () => {
    const stay = (await run()).get(2)!;
    expect(stay.avg_negotiated_rate).toBeNull();
    expect(stay.min_negotiated_rate).toBeNull();
    expect(stay.max_negotiated_rate).toBeNull();
  });

  it("keeps Oria's stats for non-DRG lines", async () => {
    const line = (await run()).get(3)!;
    expect(Number(line.avg_negotiated_rate)).toBe(5370);
    expect(Number(line.payer_count)).toBe(3);
  });

  it("keeps one row per distinct price and drops unpriced lines", async () => {
    const rows = await run();
    expect(rows.has(3)).toBe(true);
    expect(rows.has(4)).toBe(false);
    expect(rows.has(5)).toBe(false);
  });

  it("returns one row per charge, scoped to the state", async () => {
    const all = await db.all(buildChargeSelect({ state: "TX", codeFilter }));
    expect(all).toHaveLength(3);
    expect(all.every((r) => Number(r.hospital_id) === 1)).toBe(true);
    const limited = await db.all(
      buildChargeSelect({ state: "TX", codeFilter, limit: 1 })
    );
    expect(limited).toHaveLength(1);
  });
});
