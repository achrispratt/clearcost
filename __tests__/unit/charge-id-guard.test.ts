import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { Database } from "duckdb-async";
import {
  assertChargeIdsUnique,
  CHARGE_LINEAGE_CONFLICT,
} from "@/lib/data/charge-id-guard";

// Runs the real guard query against a tiny in-memory copy of standard_charges.
let db: Database;

async function load(rows: [number, number | null, string][]) {
  await db.run(
    `CREATE TABLE standard_charges (hospital_id INT, charge_id BIGINT, ms_drg VARCHAR)`
  );
  for (const [hospital, charge, drg] of rows) {
    await db.run(
      `INSERT INTO standard_charges VALUES (?, ?, ?)`,
      hospital,
      charge,
      drg
    );
  }
}

beforeEach(async () => {
  db = await Database.create(":memory:");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
});

describe("assertChargeIdsUnique", () => {
  it("passes when the same charge_id appears at different hospitals", async () => {
    // Oria numbers rows per hospital file, so ids 1 and 2 recur everywhere.
    await load([
      [1, 1, "652"],
      [1, 2, "652"],
      [2, 1, "652"],
      [2, 2, "652"],
      [3, 1, "652"],
    ]);
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652')")
    ).resolves.toBeUndefined();
  });

  it("stops when a charge_id repeats within one hospital", async () => {
    await load([
      [1, 1, "652"],
      [2, 7, "652"],
      [2, 7, "652"],
    ]);
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652')")
    ).rejects.toThrow(
      /1 \(hospital_id, charge_id\) pairs.*hospital 2, charge_id 7/
    );
  });

  it("only checks rows inside the scope filter", async () => {
    await load([
      [1, 1, "652"],
      [1, 1, "470"], // repeat, but outside the scope
    ]);
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652')")
    ).resolves.toBeUndefined();
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652','470')")
    ).rejects.toThrow(/repeats within a hospital/);
  });

  it("ignores rows without a charge_id", async () => {
    await load([
      [1, null, "652"],
      [1, null, "652"],
      [1, 1, "652"],
    ]);
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652')")
    ).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("2 rows without charge_id get NULL")
    );
  });

  it("works on an empty scope", async () => {
    await load([]);
    await expect(
      assertChargeIdsUnique(db, "ms_drg IN ('652')")
    ).resolves.toBeUndefined();
  });
});

describe("CHARGE_LINEAGE_CONFLICT", () => {
  // ON CONFLICT fails at runtime unless a unique index matches it exactly.
  const root = path.resolve(__dirname, "../..");
  const indexDef =
    /create unique index if not exists idx_charges_provider_source_charge_id\s+on (?:public\.)?charges \(provider_id, source_charge_id\)\s+where source_charge_id is not null/i;

  it("is keyed per provider", () => {
    expect(CHARGE_LINEAGE_CONFLICT).toBe(
      "(provider_id, source_charge_id) WHERE source_charge_id IS NOT NULL"
    );
  });

  it("matches the unique index in schema.sql and the migration", () => {
    const schema = readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
    const migration = readFileSync(
      path.join(
        root,
        "supabase/migrations/20261022090000_charges_source_charge_id_per_provider.sql"
      ),
      "utf8"
    );
    expect(schema).toMatch(indexDef);
    expect(migration).toMatch(indexDef);
    // The old global index must be gone: it rejects the same charge_id at
    // two hospitals.
    expect(schema).not.toMatch(/idx_charges_source_charge_id\b/);
    expect(migration).toMatch(
      /drop index if exists public\.idx_charges_source_charge_id;/
    );
  });

  it("is what both Oria loaders upsert on", () => {
    for (const file of [
      "lib/data/import-trilliant.ts",
      "lib/data/backfill-inpatient.ts",
    ]) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src).toContain("ON CONFLICT ${CHARGE_LINEAGE_CONFLICT}");
      expect(src).not.toMatch(/ON CONFLICT \(source_charge_id\)/);
    }
  });
});
