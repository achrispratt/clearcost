import type { FeeScope } from "@/types";

export function feeScope(billingClass: string | undefined): FeeScope {
  const value = billingClass?.trim().toLowerCase();
  if (value === "facility") return "facility";
  if (value === "professional") return "professional";
  if (value === "both") return "complete";
  return "unknown";
}

/** Price basis an entry compares on: cash, insured, or an estimate from either. */
function basisKind(price: { type: string; basis?: string }): string {
  return price.type === "estimate" ? `estimate:${price.basis}` : price.type;
}

const BASIS_ORDER = ["cash", "estimate:cash", "insured", "estimate:insured"];

/**
 * One fee scope sets a comparison, never a mixture. Within it every cash and
 * insured price stays, cash first: insured prices remain visible to compare
 * even when another hospital lists a cash price (DQ-33).
 */
export function comparableScope<
  T extends {
    scope: FeeScope;
    price: { type: string; basis?: string };
  },
>(entries: T[]): T[] {
  if (entries.length === 0) return [];
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
  return BASIS_ORDER.flatMap((kind) =>
    entries.filter((e) => e.scope === scope && basisKind(e.price) === kind)
  );
}

/** One fee scope and one price basis set a range, never a mixture. */
export function comparablePrices<
  T extends {
    scope: FeeScope;
    price: { type: string; basis?: string };
  },
>(entries: T[]): T[] {
  const scoped = comparableScope(entries);
  if (scoped.length === 0) return [];
  const kind = basisKind(scoped[0].price);
  return scoped.filter((e) => basisKind(e.price) === kind);
}
