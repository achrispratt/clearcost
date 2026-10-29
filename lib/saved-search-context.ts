import {
  extractBodySite,
  extractLaterality,
} from "@/lib/cpt/body-site-laterality-constants";
import { normalizePricingPlanInput } from "@/lib/cpt/pricing-plan";
import type {
  BillingCodeType,
  CPTCode,
  SavedSearch,
  SavedSearchContext,
} from "@/types";

const CODE = /^[A-Z0-9]{1,7}$/;
const TYPES = new Set(["cpt", "hcpcs", "ms_drg"]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const validCode = (v: unknown, type?: unknown): v is string =>
  typeof v === "string" &&
  (type === "ms_drg"
    ? /^\d{1,3}$/.test(v)
    : type === undefined
      ? CODE.test(v)
      : /^[A-Z0-9]{3,7}$/.test(v));

function validGroups(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every(
      (g) =>
        record(g) &&
        typeof g.codeType === "string" &&
        TYPES.has(g.codeType) &&
        Array.isArray(g.codes) &&
        g.codes.length > 0 &&
        g.codes.length <= 50 &&
        g.codes.every((code) => validCode(code, g.codeType)) &&
        (g.label === undefined || text(g.label, 200))
    )
  );
}

/** Validate and copy only the bounded fields needed to reproduce a resolved search. */
export function parseSearchContext(value: unknown): SavedSearchContext | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    !Array.isArray(value.codes) ||
    value.codes.length > 50 ||
    !text(value.interpretation, 2000)
  )
    return null;
  const codes: CPTCode[] = [];
  for (const code of value.codes) {
    if (
      !record(code) ||
      !validCode(code.code, code.codeType) ||
      typeof code.codeType !== "string" ||
      !TYPES.has(code.codeType) ||
      !text(code.description, 500) ||
      !text(code.category, 100)
    )
      return null;
    codes.push({
      code: code.code,
      codeType: code.codeType as BillingCodeType,
      description: code.description,
      category: code.category,
    });
  }
  const laterality = extractLaterality(value.laterality);
  const bodySite = extractBodySite(value.bodySite);
  if (
    (value.laterality !== undefined && !laterality) ||
    (value.bodySite !== undefined && !bodySite)
  )
    return null;
  let pricingPlan;
  if (value.pricingPlan !== undefined) {
    const p = value.pricingPlan;
    if (
      !record(p) ||
      typeof p.mode !== "string" ||
      typeof p.queryType !== "string" ||
      !["procedure_first", "encounter_first"].includes(p.mode) ||
      !["procedure", "code", "symptom", "condition"].includes(p.queryType) ||
      !validGroups(p.baseCodeGroups) ||
      !Array.isArray(p.adders) ||
      p.adders.length > 10 ||
      !p.adders.every(
        (a) =>
          record(a) &&
          text(a.id, 100) &&
          text(a.label, 200) &&
          validGroups(a.codeGroups)
      ) ||
      (p.proxyLabel !== undefined && !text(p.proxyLabel, 200)) ||
      (p.laterality !== undefined && !extractLaterality(p.laterality)) ||
      (p.bodySite !== undefined && !extractBodySite(p.bodySite)) ||
      (p.encounterType !== undefined &&
        (typeof p.encounterType !== "string" ||
          !["emergency", "office", "urgent_care_proxy", "specialist"].includes(
            p.encounterType
          )))
    )
      return null;
    pricingPlan = normalizePricingPlanInput(p);
    if (!pricingPlan) return null;
  }
  if (codes.length === 0 && !pricingPlan) return null;
  return {
    version: 1,
    codes,
    interpretation: value.interpretation,
    pricingPlan,
    laterality,
    bodySite,
  };
}

/** Saved context takes precedence; legacy rows use their stored codes. */
export function savedSearchHref(search: SavedSearch): string {
  const params = new URLSearchParams({ q: search.query, loc: search.location });
  if (
    search.lat == null ||
    search.lng == null ||
    !Number.isFinite(search.lat) ||
    !Number.isFinite(search.lng)
  ) {
    // Never silently move an old search to New York when coordinates are missing.
    return `/?${params}`;
  }
  params.set("lat", String(search.lat));
  params.set("lng", String(search.lng));
  const context = parseSearchContext(search.search_context);
  const codes =
    (context?.codes.length
      ? context.codes
      : context?.pricingPlan?.baseCodeGroups.flatMap((group) =>
          group.codes.map((code) => ({
            code,
            codeType: group.codeType,
            description: "",
            category: "Procedure",
          }))
        )) ??
    search.cpt_codes
      .filter((code) => validCode(code))
      .map(
        (code): CPTCode => ({
          code,
          codeType: /^\d{5}$/.test(code)
            ? "cpt"
            : /^\d{1,3}$/.test(code)
              ? "ms_drg"
              : "hcpcs",
          description: "",
          category: "Procedure",
        })
      );
  const groups = new Map<BillingCodeType, string[]>();
  for (const code of codes) {
    const type = code.codeType ?? "cpt";
    groups.set(type, [...(groups.get(type) ?? []), code.code]);
  }
  if (codes.length) {
    params.set("codes", codes.map((c) => c.code).join(","));
    params.set("codeType", codes[0].codeType ?? "cpt");
    params.set(
      "codeGroups",
      JSON.stringify(
        [...groups].map(([codeType, values]) => ({ codeType, codes: values }))
      )
    );
    params.set(
      "codeDescs",
      JSON.stringify(
        Object.fromEntries(codes.map((c) => [c.code, c.description]))
      )
    );
  }
  if (context) {
    params.set("interp", context.interpretation);
    if (context.pricingPlan)
      params.set("plan", JSON.stringify(context.pricingPlan));
    if (context.laterality) params.set("side", context.laterality);
    if (context.bodySite) params.set("site", context.bodySite);
  }
  return `${codes.length || context?.pricingPlan ? "/results" : "/guided-search"}?${params}`;
}
