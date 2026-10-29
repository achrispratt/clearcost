import type { FeeScope } from "@/types";

export function feeScope(billingClass: string | undefined): FeeScope {
  const value = billingClass?.trim().toLowerCase();
  if (value === "facility") return "facility";
  if (value === "professional") return "professional";
  if (value === "both") return "complete";
  return "unknown";
}

/** One fee scope and one price basis/source set a comparison, never a mixture. */
export function comparablePrices<
  T extends {
    scope: FeeScope;
    price: { type: string; basis?: string };
  },
>(entries: T[]): T[] {
  const hospitalScopes: FeeScope[] = ["facility", "complete"];
  const scopes = hospitalScopes.some((s) => entries.some((e) => e.scope === s))
    ? hospitalScopes
    : entries.some((e) => e.scope === "professional")
      ? ["professional"]
      : (["unknown"] as FeeScope[]);
  const scope = scopes.reduce((best, candidate) =>
    entries.filter((e) => e.scope === candidate).length >
    entries.filter((e) => e.scope === best).length
      ? candidate
      : best
  );
  const scoped = entries.filter((e) => e.scope === scope);
  for (const kind of ["cash", "estimate:cash", "insured", "estimate:insured"]) {
    const matching = scoped.filter(
      (e) =>
        (e.price.type === "estimate"
          ? `estimate:${e.price.basis}`
          : e.price.type) === kind
    );
    if (matching.length) return matching;
  }
  return [];
}
