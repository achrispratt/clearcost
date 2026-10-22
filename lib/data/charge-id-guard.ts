import type { Database } from "duckdb-async";

/**
 * Conflict target for upserts keyed on Oria lineage. Matches the partial
 * unique index idx_charges_provider_source_charge_id (migration
 * 20261022090000_charges_source_charge_id_per_provider.sql). Oria's
 * charge_id is a row number inside one hospital's file, so it is only unique
 * per hospital, and each Oria hospital_id maps to exactly one provider
 * (providers.trilliant_hospital_id is unique).
 */
export const CHARGE_LINEAGE_CONFLICT =
  "(provider_id, source_charge_id) WHERE source_charge_id IS NOT NULL";

/**
 * Stop an import when Oria's charge_id repeats within one hospital in the rows
 * it would load.
 *
 * charges is unique on (provider_id, source_charge_id). If two source rows of
 * the same hospital shared a charge_id, one would overwrite (or silently
 * replace) the other, which is wrong data. The same charge_id at different
 * hospitals is normal. One DuckDB scan over `standard_charges WHERE
 * <scopeFilter>`, grouped by (hospital_id, charge_id). Call it before any
 * DELETE.
 */
export async function assertChargeIdsUnique(
  db: Database,
  scopeFilter: string
): Promise<void> {
  console.log("  Checking Oria charge_id is unique within each hospital...");
  const rows = (await db.all(
    `WITH ids AS (
       SELECT hospital_id, charge_id, COUNT(*) AS n
       FROM standard_charges
       WHERE (${scopeFilter}) AND charge_id IS NOT NULL
       GROUP BY hospital_id, charge_id
     )
     SELECT
       (SELECT COUNT(*) FROM standard_charges WHERE ${scopeFilter}) AS cnt,
       COALESCE(SUM(n), 0) AS non_null,
       COUNT(*) FILTER (WHERE n > 1) AS repeated
     FROM ids`
  )) as unknown as {
    cnt: number | bigint;
    non_null: number | bigint;
    repeated: number | bigint;
  }[];
  const total = Number(rows[0].cnt);
  const nonNull = Number(rows[0].non_null);
  const repeated = Number(rows[0].repeated);

  if (repeated > 0) {
    const [example] = (await db.all(
      `SELECT hospital_id, charge_id
       FROM standard_charges
       WHERE (${scopeFilter}) AND charge_id IS NOT NULL
       GROUP BY hospital_id, charge_id
       HAVING COUNT(*) > 1
       ORDER BY hospital_id, charge_id
       LIMIT 1`
    )) as unknown as {
      hospital_id: number | bigint;
      charge_id: number | bigint;
    }[];
    throw new Error(
      `Oria charge_id repeats within a hospital: ${repeated.toLocaleString()} (hospital_id, charge_id) ` +
        `pairs appear more than once (e.g. hospital ${example.hospital_id}, charge_id ` +
        `${example.charge_id}). Upserting on (provider_id, source_charge_id) would overwrite ` +
        `rows of the same hospital, so the import stopped before deleting anything.`
    );
  }
  console.log(
    `  charge_id unique per hospital: ${nonNull.toLocaleString()} ids over ${total.toLocaleString()} rows` +
      (total !== nonNull
        ? ` (${(total - nonNull).toLocaleString()} rows without charge_id get NULL)`
        : "")
  );
}
