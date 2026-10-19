/**
 * Some hospital files put a placeholder ($0.01, $0.35, ...) in the cash or
 * gross column. Shown as a price, it becomes "Lowest: $0". A wrong price is
 * worse than none, so these values are treated as missing.
 *
 * HCPCS Level II codes (J, Q, A, ...) are often priced per unit of a drug or
 * supply, where a few cents can be real, so they are left alone.
 *
 * snapshot_data_quality() counts the rows these rules hide each night; keep
 * its thresholds in step.
 */

const HCPCS_LEVEL_II = /^[A-V]\d{4}$/;

/** Below this, a procedure, visit, test or stay price is a placeholder. */
const MIN_PLAUSIBLE_PRICE = 1;

/**
 * A cash or gross price more than 20x below the lowest insurer rate at the
 * same hospital is not a real self-pay price.
 */
const MAX_BELOW_LOWEST_INSURED = 20;

export function plausiblePrice(
  value: number | null | undefined,
  code: string | null | undefined,
  lowestInsuredRate?: number | null
): number | undefined {
  if (value == null || Number.isNaN(value) || value <= 0) return undefined;
  if (code && HCPCS_LEVEL_II.test(code.trim().toUpperCase())) return value;
  if (value < MIN_PLAUSIBLE_PRICE) return undefined;
  if (
    lowestInsuredRate != null &&
    lowestInsuredRate > 0 &&
    value * MAX_BELOW_LOWEST_INSURED < lowestInsuredRate
  ) {
    return undefined;
  }
  return value;
}
