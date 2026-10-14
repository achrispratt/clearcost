// Hospital price files spell billing_class and setting many ways
// ("Facility", "FACILITY", "faciltiy", " outpatient "). Store one spelling so
// SQL and app code can compare them directly (#177).

const BILLING_CLASS_ALIASES: Record<string, string> = {
  faciltiy: "facility",
  hospital: "facility",
};

export function normalizeBillingClass(
  value: string | null | undefined
): string | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  return BILLING_CLASS_ALIASES[v] ?? v;
}

export function normalizeSetting(
  value: string | null | undefined
): string | null {
  const v = value?.trim().toLowerCase();
  return v || null;
}
