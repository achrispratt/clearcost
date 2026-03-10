import {
  extractLaterality,
  extractBodySite,
} from "./body-site-laterality-constants";
import type {
  BodySite,
  BillingCodeType,
  CPTCode,
  Laterality,
  PricingPlan,
  PricingCodeGroup,
  PlannedAdder,
  QueryType,
} from "@/types";

const DEFAULT_ED_VISIT_CODES = ["99281", "99282", "99283", "99284", "99285"];
const DEFAULT_OFFICE_VISIT_CODES = [
  "99202",
  "99203",
  "99204",
  "99205",
  "99212",
  "99213",
  "99214",
  "99215",
];

const EMERGENCY_RED_FLAG_REGEX =
  /\b(worst (headache|pain) of (my|their) life|sudden onset|thunderclap|stroke|can't breathe|cannot breathe|severe chest pain|severe abdominal pain|passed out|loss of consciousness)\b/i;
const URGENT_CARE_REGEX = /\burgent care\b/i;
const SPECIALIST_REGEX =
  /\bneurology|neurologist|orthopedic|orthopedist|dermatology|cardiology|gastroenterology|specialist\b/i;
const CPT_QUERY_REGEX = /\bcpt\s*\d{4,5}\b|\b\d{5}\b/i;
const SYMPTOM_HINT_REGEX =
  /\b(headache|pain|hurts|fever|cough|nausea|dizziness|shortness of breath|rash|fatigue|swelling)\b/i;
const CONDITION_HINT_REGEX =
  /\b(flu|migraine|asthma|diabetes|infection|fracture|broken|sprain|strain)\b/i;

type AdderTemplate = Omit<PlannedAdder, "required">;

const ADDER_TEMPLATES: Record<string, AdderTemplate> = {
  ct_scan: {
    id: "ct_scan",
    label: "CT scan",
    codeGroups: [
      { codeType: "cpt", codes: ["70450", "70460", "70470", "71250", "74177"] },
    ],
  },
  mri_scan: {
    id: "mri_scan",
    label: "MRI",
    codeGroups: [
      { codeType: "cpt", codes: ["70551", "70552", "70553", "72148", "73721"] },
    ],
  },
  xray: {
    id: "xray",
    label: "X-ray",
    codeGroups: [
      { codeType: "cpt", codes: ["71046", "73564", "72040", "73610"] },
    ],
  },
  ultrasound: {
    id: "ultrasound",
    label: "Ultrasound",
    codeGroups: [
      { codeType: "cpt", codes: ["76700", "76705", "76856", "93971"] },
    ],
  },
  lab_work: {
    id: "lab_work",
    label: "Lab work",
    codeGroups: [
      {
        codeType: "cpt",
        codes: ["80048", "80053", "85025", "80061", "84443", "83036", "81003"],
      },
    ],
  },
};

const ADDER_TRIGGERS: Array<{ id: string; regex: RegExp }> = [
  { id: "ct_scan", regex: /\bct\b|cat scan|computed tomography/i },
  { id: "mri_scan", regex: /\bmri\b|magnetic resonance/i },
  { id: "xray", regex: /\bx-?ray\b|radiograph/i },
  { id: "ultrasound", regex: /\bultrasound\b|sonogram|sonography/i },
  { id: "lab_work", regex: /\blab\b|blood test|bloodwork|panel/i },
];

export interface BuildPricingPlanParams {
  query: string;
  interpretation?: string;
  queryType?: QueryType;
  codes?: CPTCode[];
  modelPricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
}

function normalizeCodeType(value: unknown): BillingCodeType {
  if (value === "hcpcs" || value === "ms_drg") return value;
  return "cpt";
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeCodeGroups(value: unknown): PricingCodeGroup[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (
        group
      ): group is { codeType?: unknown; codes?: unknown; label?: unknown } =>
        !!group && typeof group === "object"
    )
    .map((group) => {
      const normalizedCodes = Array.isArray(group.codes)
        ? group.codes
            .filter(
              (code): code is string =>
                typeof code === "string" && code.trim().length > 0
            )
            .map((code) => normalizeCode(code))
        : [];

      return {
        codeType: normalizeCodeType(group.codeType),
        codes: Array.from(new Set(normalizedCodes)),
        label: typeof group.label === "string" ? group.label : undefined,
      };
    })
    .filter((group) => group.codes.length > 0);
}

function normalizePlannedAdders(value: unknown): PlannedAdder[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (
        adder
      ): adder is {
        id?: unknown;
        label?: unknown;
        codeGroups?: unknown;
        required?: unknown;
      } => !!adder && typeof adder === "object"
    )
    .map((adder, index) => {
      const codeGroups = normalizeCodeGroups(adder.codeGroups);
      const idValue =
        typeof adder.id === "string" && adder.id.trim().length > 0
          ? adder.id.trim()
          : `adder_${index + 1}`;

      const labelValue =
        typeof adder.label === "string" && adder.label.trim().length > 0
          ? adder.label.trim()
          : idValue.replace(/_/g, " ");

      return {
        id: idValue,
        label: labelValue,
        codeGroups,
        required: adder.required === true,
      };
    })
    .filter((adder) => adder.codeGroups.length > 0);
}

function normalizeQueryType(value: unknown): QueryType {
  if (value === "symptom" || value === "condition" || value === "code") {
    return value;
  }
  return "procedure";
}

function dedupeCodeGroups(codeGroups: PricingCodeGroup[]): PricingCodeGroup[] {
  const merged = new Map<string, Set<string>>();
  const labels = new Map<string, string>();

  for (const group of codeGroups) {
    const key = group.codeType;
    const existing = merged.get(key) || new Set<string>();
    for (const code of group.codes) {
      existing.add(normalizeCode(code));
    }
    merged.set(key, existing);
    if (group.label && !labels.has(key)) labels.set(key, group.label);
  }

  return Array.from(merged.entries())
    .map(([codeType, codeSet]) => ({
      codeType: codeType as BillingCodeType,
      codes: Array.from(codeSet),
      label: labels.get(codeType),
    }))
    .filter((group) => group.codes.length > 0);
}

function codesToGroups(codes: CPTCode[] = []): PricingCodeGroup[] {
  const grouped = new Map<BillingCodeType, Set<string>>();

  for (const code of codes) {
    const codeType = normalizeCodeType(code.codeType);
    const normalized = normalizeCode(code.code);
    const existing = grouped.get(codeType) || new Set<string>();
    existing.add(normalized);
    grouped.set(codeType, existing);
  }

  return Array.from(grouped.entries()).map(([codeType, groupedCodes]) => ({
    codeType,
    codes: Array.from(groupedCodes),
  }));
}

function inferQueryType(
  query: string,
  codes: CPTCode[],
  explicit?: QueryType
): QueryType {
  if (CPT_QUERY_REGEX.test(query)) return "code";
  if (EMERGENCY_RED_FLAG_REGEX.test(query) || SYMPTOM_HINT_REGEX.test(query))
    return "symptom";
  if (CONDITION_HINT_REGEX.test(query)) return "condition";
  if (explicit) return explicit;
  if (codes.length > 0 && query.trim().length < 8) return "code";
  return "procedure";
}

function buildEncounterBaseCodeGroups(
  encounterType: PricingPlan["encounterType"]
): PricingCodeGroup[] {
  if (encounterType === "emergency") {
    return [
      {
        codeType: "cpt",
        codes: DEFAULT_ED_VISIT_CODES,
        label: "Emergency department visit",
      },
    ];
  }

  return [
    {
      codeType: "cpt",
      codes: DEFAULT_OFFICE_VISIT_CODES,
      label: "Office/outpatient visit",
    },
  ];
}

function inferAdderIds(text: string): string[] {
  const ids = new Set<string>();

  for (const trigger of ADDER_TRIGGERS) {
    if (trigger.regex.test(text)) {
      ids.add(trigger.id);
    }
  }

  if (EMERGENCY_RED_FLAG_REGEX.test(text)) {
    ids.add("ct_scan");
    ids.add("mri_scan");
  }

  if (/\bflu\b|fever|infection|sick\b/i.test(text)) {
    ids.add("lab_work");
  }

  return Array.from(ids);
}

function buildAddersFromIds(ids: string[]): PlannedAdder[] {
  return ids
    .map((id) => {
      const template = ADDER_TEMPLATES[id];
      if (!template) return null;
      return {
        ...template,
        required: false,
      };
    })
    .filter((adder): adder is PlannedAdder => !!adder);
}

function mergeAdders(
  primary: PlannedAdder[],
  secondary: PlannedAdder[]
): PlannedAdder[] {
  const byId = new Map<string, PlannedAdder>();

  for (const adder of [...primary, ...secondary]) {
    const existing = byId.get(adder.id);
    if (!existing) {
      byId.set(adder.id, {
        ...adder,
        codeGroups: dedupeCodeGroups(adder.codeGroups),
      });
      continue;
    }

    byId.set(adder.id, {
      ...existing,
      label: existing.label || adder.label,
      required: existing.required || adder.required,
      codeGroups: dedupeCodeGroups([
        ...existing.codeGroups,
        ...adder.codeGroups,
      ]),
    });
  }

  return Array.from(byId.values()).filter(
    (adder) => adder.codeGroups.length > 0
  );
}

export function normalizePricingPlanInput(
  value: unknown
): PricingPlan | undefined {
  if (!value || typeof value !== "object") return undefined;

  const raw = value as {
    mode?: unknown;
    queryType?: unknown;
    encounterType?: unknown;
    baseCodeGroups?: unknown;
    adders?: unknown;
    proxyLabel?: unknown;
    laterality?: unknown;
    bodySite?: unknown;
  };

  const mode =
    raw.mode === "encounter_first" || raw.mode === "procedure_first"
      ? raw.mode
      : "procedure_first";
  const queryType = normalizeQueryType(raw.queryType);
  const encounterType =
    raw.encounterType === "emergency" ||
    raw.encounterType === "office" ||
    raw.encounterType === "urgent_care_proxy" ||
    raw.encounterType === "specialist"
      ? raw.encounterType
      : undefined;
  const baseCodeGroups = dedupeCodeGroups(
    normalizeCodeGroups(raw.baseCodeGroups)
  );
  const adders = normalizePlannedAdders(raw.adders);
  const proxyLabel =
    typeof raw.proxyLabel === "string" && raw.proxyLabel.trim().length > 0
      ? raw.proxyLabel.trim()
      : undefined;

  const laterality = extractLaterality(raw.laterality);
  const bodySite = extractBodySite(raw.bodySite);

  if (baseCodeGroups.length === 0 && adders.length === 0) return undefined;

  return {
    mode,
    queryType,
    encounterType,
    baseCodeGroups,
    adders,
    proxyLabel,
    laterality,
    bodySite,
  };
}

export function buildPricingPlan({
  query,
  interpretation,
  queryType,
  codes = [],
  modelPricingPlan,
  laterality,
  bodySite,
}: BuildPricingPlanParams): PricingPlan {
  const normalizedModelPlan = modelPricingPlan
    ? normalizePricingPlanInput(modelPricingPlan)
    : undefined;
  const queryTypeResolved = inferQueryType(
    query,
    codes,
    queryType || normalizedModelPlan?.queryType
  );
  const text = `${query} ${interpretation || ""}`;
  const emergency = EMERGENCY_RED_FLAG_REGEX.test(text);
  const urgentCare = URGENT_CARE_REGEX.test(text);
  const specialist = SPECIALIST_REGEX.test(text);

  const encounterType: PricingPlan["encounterType"] = emergency
    ? "emergency"
    : urgentCare
      ? "urgent_care_proxy"
      : specialist
        ? "specialist"
        : queryTypeResolved === "symptom" || queryTypeResolved === "condition"
          ? "office"
          : normalizedModelPlan?.encounterType;

  const mode: PricingPlan["mode"] =
    emergency ||
    queryTypeResolved === "symptom" ||
    queryTypeResolved === "condition"
      ? "encounter_first"
      : "procedure_first";

  const defaultBaseGroups =
    mode === "encounter_first"
      ? buildEncounterBaseCodeGroups(encounterType)
      : codesToGroups(codes);

  const modelBaseGroups =
    emergency || mode === "encounter_first"
      ? []
      : normalizedModelPlan?.baseCodeGroups || [];

  const baseCodeGroups = dedupeCodeGroups([
    ...modelBaseGroups,
    ...defaultBaseGroups,
  ]);

  const inferredAdders = buildAddersFromIds(inferAdderIds(text));
  const modelAdders = normalizedModelPlan?.adders || [];
  const adders = mergeAdders(modelAdders, inferredAdders);

  // Resolve laterality/bodySite: explicit params take priority, then model plan
  const resolvedLaterality = laterality ?? normalizedModelPlan?.laterality;
  const resolvedBodySite = bodySite ?? normalizedModelPlan?.bodySite;

  return {
    mode,
    queryType: queryTypeResolved,
    encounterType,
    baseCodeGroups,
    adders,
    proxyLabel:
      encounterType === "urgent_care_proxy"
        ? "Urgent care proxy using office E/M pricing."
        : normalizedModelPlan?.proxyLabel,
    laterality: resolvedLaterality,
    bodySite: resolvedBodySite,
  };
}
