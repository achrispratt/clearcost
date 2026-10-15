// DuckDB query that reads one state's charges out of the Oria lake.
//
// Oria's pre-computed negotiated stats (avg/min/max_negotiated_rate) average
// every payer rate for a charge, whatever its contract type. For an MS-DRG
// (a hospital stay) many contracts are per diem: a daily rate, not the stay.
// In Texas, per-diem rows are the majority for DRG 326/652, with a median of
// about $4k against a ~$40k stay. Averaging them in made a kidney transplant
// look like it costs $6k (#173).
//
// So for DRG rows we recompute the stats from payer-level dollar rates,
// leaving out per-diem contracts. If nothing is left, the stats are null and
// the app says it can't price the stay instead of showing a daily rate.
// Non-DRG rows keep Oria's stats unchanged.

export const EXCLUDED_STAY_METHODOLOGIES = ["per diem"];

export function buildChargeSelect(opts: {
  state: string;
  codeFilter: string;
  limit?: number;
}): string {
  const { state, codeFilter, limit = 0 } = opts;
  const excluded = EXCLUDED_STAY_METHODOLOGIES.map((m) => `'${m}'`).join(",");
  const isDrg = "sc.ms_drg IS NOT NULL AND sc.ms_drg <> ''";

  return `
    WITH stay_rates AS (
      SELECT hospital_id, charge_id,
             AVG(standard_charge_dollar) AS avg_rate,
             MIN(standard_charge_dollar) AS min_rate,
             MAX(standard_charge_dollar) AS max_rate,
             COUNT(*) AS rate_count
      FROM standard_charge_details
      WHERE UPPER(hospital_state) = '${state}' AND ${codeFilter}
        AND ms_drg IS NOT NULL AND ms_drg <> ''
        AND standard_charge_dollar > 0
        AND COALESCE(methodology_normalized, '') NOT IN (${excluded})
      GROUP BY hospital_id, charge_id
    )
    SELECT sc.charge_id, sc.hospital_id, sc.description, sc.gross_charge,
           sc.discounted_cash, sc.minimum, sc.maximum, sc.setting,
           sc.billing_class, sc.modifiers,
           sc.cpt, sc.hcpcs, sc.ms_drg, sc.rc, sc.ndc, sc.icd,
           CASE WHEN ${isDrg} THEN r.avg_rate ELSE sc.avg_negotiated_rate END AS avg_negotiated_rate,
           CASE WHEN ${isDrg} THEN r.min_rate ELSE sc.min_negotiated_rate END AS min_negotiated_rate,
           CASE WHEN ${isDrg} THEN r.max_rate ELSE sc.max_negotiated_rate END AS max_negotiated_rate,
           CASE WHEN ${isDrg} THEN r.rate_count ELSE sc.payer_count END AS payer_count
    FROM (
      SELECT * FROM standard_charges
      WHERE UPPER(hospital_state) = '${state}' AND ${codeFilter}
      ${limit > 0 ? `LIMIT ${limit}` : ""}
    ) sc
    LEFT JOIN stay_rates r
      ON r.hospital_id = sc.hospital_id AND r.charge_id = sc.charge_id`;
}
