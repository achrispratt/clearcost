/**
 * Codes whose PFS facility rate is purely the doctor's payment: surgery
 * (10000-69999) and office/hospital visits (99202-99499). Imaging, lab and
 * other codes mix technical and professional parts, so a single Medicare
 * figure would be misleading there.
 */
export function isDoctorFeeComparable(code: string): boolean {
  if (!/^\d{5}$/.test(code)) return false;
  const n = Number(code);
  return (n >= 10000 && n <= 69999) || (n >= 99202 && n <= 99499);
}
