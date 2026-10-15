import type { Database } from "duckdb-async";

/**
 * Stop an import when Oria's charge_id repeats within the rows it would load.
 *
 * charges.source_charge_id is a unique key (#59). If two source rows shared a
 * charge_id, one would overwrite (or silently replace) the other, which is
 * wrong data. One cheap DuckDB scan: COUNT(*) vs COUNT(DISTINCT charge_id)
 * over `standard_charges WHERE <scopeFilter>`. Call it before any DELETE.
 */
export async function assertChargeIdsUnique(
  db: Database,
  scopeFilter: string
): Promise<void> {
  console.log("  Checking Oria charge_id is unique across the import scope...");
  const rows = (await db.all(
    `SELECT COUNT(*) AS cnt, COUNT(DISTINCT charge_id) AS distinct_ids,
            COUNT(charge_id) AS non_null
     FROM standard_charges
     WHERE ${scopeFilter}`
  )) as unknown as {
    cnt: number | bigint;
    distinct_ids: number | bigint;
    non_null: number | bigint;
  }[];
  const total = Number(rows[0].cnt);
  const distinct = Number(rows[0].distinct_ids);
  const nonNull = Number(rows[0].non_null);

  if (distinct !== nonNull) {
    throw new Error(
      `Oria charge_id is not unique across the import scope: ${nonNull.toLocaleString()} ids, ` +
        `${distinct.toLocaleString()} distinct. Upserting on source_charge_id would overwrite ` +
        `rows from other hospitals, so the import stopped before deleting anything.`
    );
  }
  console.log(
    `  charge_id unique: ${distinct.toLocaleString()} ids over ${total.toLocaleString()} rows` +
      (total !== nonNull
        ? ` (${(total - nonNull).toLocaleString()} rows without charge_id get NULL)`
        : "")
  );
}
