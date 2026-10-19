import type {
  Finding,
  HospitalPrice,
  ProviderFingerprint,
  SearchSnapshot,
  Severity,
  Snapshot,
} from "./types";

// ============================================================================
// Compares two snapshots and says what a load or modification changed for
// patients. The rule of thumb: inside the states a load touches, prices may
// move and every move is listed for review; outside them, nothing should
// change at all. Losing a hospital or a code is a failure anywhere, because a
// patient who used to see a price now sees none.
// ============================================================================

/** A price move smaller than this is noise (rounding, tie order). */
export const PRICE_EPSILON = 0.01;
/** In-scope price moves above this share are listed for review. */
export const REVIEW_PRICE_CHANGE = 0.25;
/** A search's hospital count or median moving this much is reviewed. */
export const REVIEW_SEARCH_CHANGE = 0.25;
/** Same factor as the city pages' outlier rule (lib/seo/prices.ts). */
export const IMPLAUSIBLE_FACTOR = 10;
/** Mirrors MIN_PRICED_HOSPITALS: a city page needs this many to publish. */
export const PUBLISHABLE_HOSPITALS = 3;

export interface Comparison {
  findings: Finding[];
  counts: Record<Severity, number>;
  stats: {
    searches: number;
    pricedHospitalsBefore: number;
    pricedHospitalsAfter: number;
    pricesChanged: number;
    hospitalsGained: number;
    providersFingerprinted: number;
    providersReloaded: number;
  };
  /** Outside-scope changes are only reviewed when the price filters moved. */
  referenceChanged: boolean;
  states: string[];
}

function isPriced(h: HospitalPrice): boolean {
  return h.amount > 0 && (h.type === "cash" || h.type === "insured");
}

function money(n: number | null | undefined): string {
  return n == null ? "none" : `$${Math.round(n).toLocaleString("en-US")}`;
}

function share(before: number, after: number): number {
  return before === 0 ? (after === 0 ? 0 : 1) : (after - before) / before;
}

function pct(x: number): string {
  return `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
}

function publishable(s: SearchSnapshot): boolean {
  return (
    s.answer.state === "priced" && s.answer.rangeCount >= PUBLISHABLE_HOSPITALS
  );
}

/** A hospital is in scope when the change was expected to touch its state. */
function inScope(states: Set<string>, state: string | undefined): boolean {
  return !!state && states.has(state.toUpperCase());
}

function compareSearches(
  before: Snapshot,
  after: Snapshot,
  states: Set<string>,
  referenceChanged: boolean,
  add: (f: Finding) => void,
  stats: Comparison["stats"]
) {
  const afterByKey = new Map(after.searches.map((s) => [s.key, s]));

  for (const b of before.searches) {
    const a = afterByKey.get(b.key);
    if (!a) {
      add({
        severity: "fail",
        kind: "search_missing",
        key: b.key,
        message: `${b.key}: in the before snapshot but not the after one`,
        weight: b.hospitals.length,
      });
      continue;
    }
    stats.searches++;

    const afterHospitals = new Map(a.hospitals.map((h) => [h.id, h]));
    const beforeIds = new Set(b.hospitals.map((h) => h.id));
    stats.pricedHospitalsBefore += b.hospitals.filter(isPriced).length;
    stats.pricedHospitalsAfter += a.hospitals.filter(isPriced).length;

    for (const hb of b.hospitals) {
      if (!isPriced(hb)) continue;
      const ha = afterHospitals.get(hb.id);
      const local = inScope(states, hb.state);

      if (!ha || !isPriced(ha)) {
        add({
          // A filter refresh can hide a price anywhere; still worth a look.
          severity: !local && referenceChanged ? "review" : "fail",
          kind: "hospital_lost",
          key: b.key,
          message: `${b.key}: ${hb.name} (${hb.state ?? "?"}) had a ${hb.type} price of ${money(hb.amount)}, now ${ha ? "no usable price" : "no result"}`,
          weight: hb.amount,
        });
        continue;
      }

      const moved = Math.abs(ha.amount - hb.amount) > PRICE_EPSILON;
      const typeChanged = ha.type !== hb.type;
      if (!moved && !typeChanged) continue;
      stats.pricesChanged++;

      const change = share(hb.amount, ha.amount);
      const detail = `${b.key}: ${hb.name} (${hb.state ?? "?"}) ${hb.type} ${money(hb.amount)} → ${ha.type} ${money(ha.amount)} (${pct(change)})`;
      let severity: Severity;
      if (!local) {
        severity = referenceChanged ? "review" : "fail";
      } else {
        severity =
          typeChanged || Math.abs(change) > REVIEW_PRICE_CHANGE
            ? "review"
            : "info";
      }
      add({
        severity,
        kind: local ? "price_changed" : "price_changed_outside_scope",
        key: b.key,
        message: detail,
        weight: Math.abs(ha.amount - hb.amount),
      });
    }

    for (const ha of a.hospitals) {
      if (beforeIds.has(ha.id) || !isPriced(ha)) continue;
      stats.hospitalsGained++;
      add({
        severity: "info",
        kind: "hospital_gained",
        key: b.key,
        message: `${b.key}: ${ha.name} (${ha.state ?? "?"}) newly priced at ${money(ha.amount)} (${ha.type})`,
        weight: ha.amount,
      });
    }

    // Plausibility of what patients now see, whatever the cause.
    const national = after.nationalMedians[b.procedure];
    if (national) {
      for (const ha of a.hospitals) {
        if (!isPriced(ha) || ha.scope === "professional") continue;
        const off =
          ha.amount > national * IMPLAUSIBLE_FACTOR ||
          ha.amount < national / IMPLAUSIBLE_FACTOR;
        const wasOff = b.hospitals.some(
          (hb) =>
            hb.id === ha.id &&
            isPriced(hb) &&
            Math.abs(hb.amount - ha.amount) <= PRICE_EPSILON
        );
        if (off && !wasOff) {
          add({
            severity: "fail",
            kind: "implausible_price",
            key: b.key,
            message: `${b.key}: ${ha.name} (${ha.state ?? "?"}) now shows ${money(ha.amount)}, more than ${IMPLAUSIBLE_FACTOR}x off the national typical ${money(national)}`,
            weight: ha.amount,
          });
        }
      }
    }

    if (publishable(b) && !publishable(a)) {
      add({
        severity: "review",
        kind: "page_unpublished",
        key: b.key,
        message: `${b.key}: city page no longer publishes (${b.answer.rangeCount} → ${a.answer.rangeCount} priced entries, state ${a.answer.state})`,
        weight: b.answer.rangeCount,
      });
    }
    const countChange = share(b.answer.rangeCount, a.answer.rangeCount);
    if (
      countChange < -REVIEW_SEARCH_CHANGE &&
      b.answer.rangeCount - a.answer.rangeCount >= 2
    ) {
      add({
        severity: "review",
        kind: "search_shrank",
        key: b.key,
        message: `${b.key}: priced entries ${b.answer.rangeCount} → ${a.answer.rangeCount} (${pct(countChange)})`,
        weight: b.answer.rangeCount - a.answer.rangeCount,
      });
    }
    if (b.answer.median && a.answer.median) {
      const medianChange = share(b.answer.median, a.answer.median);
      if (Math.abs(medianChange) > REVIEW_SEARCH_CHANGE) {
        add({
          severity: "review",
          kind: "median_moved",
          key: b.key,
          message: `${b.key}: median ${money(b.answer.median)} → ${money(a.answer.median)} (${pct(medianChange)})`,
          weight: Math.abs(a.answer.median - b.answer.median),
        });
      }
    }
  }
}

function compareProviders(
  before: Record<string, ProviderFingerprint>,
  after: Record<string, ProviderFingerprint>,
  add: (f: Finding) => void,
  stats: Comparison["stats"]
) {
  for (const [id, b] of Object.entries(before)) {
    const a = after[id];
    stats.providersFingerprinted++;
    const label = `${b.name} (${b.state ?? "?"})`;
    const pricedBefore = Object.entries(b.codes).filter(([, c]) => c[1] > 0);
    if (!a) {
      if (pricedBefore.length > 0) {
        add({
          severity: "fail",
          kind: "provider_missing",
          key: id,
          message: `${label}: priced ${pricedBefore.length} codes before, missing from the after snapshot`,
          weight: pricedBefore.length,
        });
      }
      continue;
    }
    if (a.lastLoaded !== b.lastLoaded) stats.providersReloaded++;

    const lost = pricedBefore
      .filter(([code]) => !a.codes[code] || a.codes[code][1] === 0)
      .map(([code]) => code);
    if (lost.length > 0) {
      add({
        severity: "fail",
        kind: "codes_lost",
        key: id,
        message: `${label}: ${lost.length} of ${pricedBefore.length} priced codes have no price now (${lost.slice(0, 12).join(", ")}${lost.length > 12 ? ", …" : ""})`,
        weight: lost.length,
      });
    }
    const gained = Object.entries(a.codes).filter(
      ([code, c]) => c[1] > 0 && !(b.codes[code]?.[1] > 0)
    ).length;
    if (gained > 0) {
      add({
        severity: "info",
        kind: "codes_gained",
        key: id,
        message: `${label}: ${gained} codes newly priced`,
        weight: gained,
      });
    }
  }
}

export function compareSnapshots(
  before: Snapshot,
  after: Snapshot,
  scopeStates?: string[]
): Comparison {
  const states = new Set(
    (scopeStates ?? [...before.states, ...after.states]).map((s) =>
      s.toUpperCase()
    )
  );
  const referenceChanged = before.referenceHash !== after.referenceHash;
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const stats: Comparison["stats"] = {
    searches: 0,
    pricedHospitalsBefore: 0,
    pricedHospitalsAfter: 0,
    pricesChanged: 0,
    hospitalsGained: 0,
    providersFingerprinted: 0,
    providersReloaded: 0,
  };

  compareSearches(before, after, states, referenceChanged, add, stats);
  compareProviders(before.providers, after.providers, add, stats);

  const rank: Record<Severity, number> = { fail: 0, review: 1, info: 2 };
  findings.sort(
    (x, y) => rank[x.severity] - rank[y.severity] || y.weight - x.weight
  );
  const counts: Record<Severity, number> = { fail: 0, review: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  return {
    findings,
    counts,
    stats,
    referenceChanged,
    states: [...states].sort(),
  };
}

const KIND_LABELS: Record<string, string> = {
  search_missing: "Search missing",
  hospital_lost: "Hospital lost its price",
  implausible_price: "Implausible price now shown",
  codes_lost: "Codes lost at a hospital",
  provider_missing: "Hospital missing",
  price_changed_outside_scope: "Price changed outside the load's states",
  price_changed: "Price changed",
  page_unpublished: "City page would unpublish",
  search_shrank: "Fewer hospitals priced",
  median_moved: "Median moved",
  hospital_gained: "Hospital newly priced",
  codes_gained: "Codes newly priced",
};

/** Markdown report: verdict, totals, then every failure and review item. */
export function formatReport(
  before: Snapshot,
  after: Snapshot,
  result: Comparison,
  maxPerKind = 200
): string {
  const { counts, stats } = result;
  const verdict =
    counts.fail > 0
      ? `**FAIL**: ${counts.fail} problem(s) to fix or explain before moving on.`
      : counts.review > 0
        ? `**PASS with review**: nothing lost; ${counts.review} change(s) to look over.`
        : "**PASS**: nothing lost and nothing unexpected changed.";
  const lines = [
    `# Data check: ${before.label} → ${after.label}`,
    "",
    verdict,
    "",
    `- Before: ${before.takenAt}; after: ${after.takenAt}`,
    `- States in scope: ${result.states.length ? result.states.join(", ") : "none (nothing should change)"}`,
    `- Price filters' typical prices ${result.referenceChanged ? "changed between snapshots (outside-scope price moves downgraded to review)" : "unchanged"}`,
    `- Searches compared: ${stats.searches}; priced hospital results ${stats.pricedHospitalsBefore} → ${stats.pricedHospitalsAfter}; prices changed: ${stats.pricesChanged}; newly priced: ${stats.hospitalsGained}`,
    `- Hospitals fingerprinted: ${stats.providersFingerprinted}; reloaded between snapshots: ${stats.providersReloaded}`,
    `- Findings: ${counts.fail} fail, ${counts.review} review, ${counts.info} info`,
  ];

  for (const severity of ["fail", "review", "info"] as Severity[]) {
    const items = result.findings.filter((f) => f.severity === severity);
    if (items.length === 0) continue;
    lines.push(
      "",
      `## ${severity === "fail" ? "Failures" : severity === "review" ? "To review" : "Info"}`
    );
    const kinds = [...new Set(items.map((f) => f.kind))];
    for (const kind of kinds) {
      const ofKind = items.filter((f) => f.kind === kind);
      lines.push("", `### ${KIND_LABELS[kind] ?? kind} (${ofKind.length})`, "");
      const shown = severity === "info" ? Math.min(maxPerKind, 25) : maxPerKind;
      for (const f of ofKind.slice(0, shown)) lines.push(`- ${f.message}`);
      if (ofKind.length > shown) {
        lines.push(`- …and ${ofKind.length - shown} more`);
      }
    }
  }
  return lines.join("\n") + "\n";
}
