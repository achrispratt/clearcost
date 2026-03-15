// ============================================================================
// ClearCost Type Definitions
// Matches the database schema in supabase/schema.sql
// ============================================================================

// -- Billing code types supported by the system --
export type BillingCodeType = "cpt" | "hcpcs" | "ms_drg";
export type QueryType = "procedure" | "symptom" | "condition" | "code";
export type ConfidenceLevel = "high" | "low";

// -- Laterality --
export type Laterality = "left" | "right" | "bilateral";

// -- Body site (parsed from charge description) --
export type BodySite =
  | "knee"
  | "hip"
  | "ankle"
  | "shoulder"
  | "elbow"
  | "wrist"
  | "hand"
  | "foot"
  | "cervical_spine"
  | "thoracic_spine"
  | "lumbar_spine"
  | "sacral_spine"
  | "chest"
  | "abdomen"
  | "pelvis"
  | "head"
  | "neck";

// -- Care setting --
export type ChargeSetting = "inpatient" | "outpatient" | "both";
export type AdderEstimateSource = "facility" | "local_fallback";
export type AdderEstimateConfidence = "high" | "low";
export type OptionalAdderType =
  | "xray"
  | "mri"
  | "ct"
  | "ultrasound"
  | "lab"
  | "other";
export type PricingMode = "encounter_first" | "procedure_first";
export type EncounterType =
  | "emergency"
  | "office"
  | "urgent_care_proxy"
  | "specialist";
export type FallbackSource = "facility" | "local_fallback";

export interface PricingCodeGroup {
  codeType: BillingCodeType;
  codes: string[];
  label?: string;
}

export interface PlannedAdder {
  id: string;
  label: string;
  codeGroups: PricingCodeGroup[];
  required: boolean;
}

export interface PricingPlan {
  mode: PricingMode;
  queryType: QueryType;
  encounterType?: EncounterType;
  baseCodeGroups: PricingCodeGroup[];
  adders: PlannedAdder[];
  proxyLabel?: string;
  laterality?: Laterality;
  bodySite?: BodySite;
}

export interface OptionalAdderEstimate {
  type: OptionalAdderType;
  label: string;
  id?: string;
  estimatePrice?: number;
  minPrice?: number;
  maxPrice?: number;
  source: AdderEstimateSource;
  confidence: AdderEstimateConfidence;
}

// -- CPT Code (used by AI translation layer) --
export interface CPTCode {
  code: string;
  description: string;
  category: string;
  codeType?: BillingCodeType; // Which billing system this code belongs to
}

// -- Provider (hospital, imaging center, ASC, lab, clinic) --
export interface Provider {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  providerType?: string;
}

// -- Charge Result (main search result item) --
export interface ChargeResult {
  id: string;
  provider: Provider;
  description?: string;
  setting?: ChargeSetting;
  billingClass?: string;
  laterality?: Laterality;
  bodySite?: BodySite;

  // Billing codes (a charge may have codes in multiple systems)
  cpt?: string;
  hcpcs?: string;
  msDrg?: string;

  // Prices
  grossCharge?: number;
  cashPrice?: number;
  isDiscounted?: boolean; // true = discounted, false = cash==gross (show badge), undefined = can't determine
  minPrice?: number;
  maxPrice?: number;

  // Aggregate negotiated rate stats
  avgNegotiatedRate?: number;
  minNegotiatedRate?: number;
  maxNegotiatedRate?: number;
  payerCount?: number;

  // Metadata
  source?: string;
  lastUpdated?: string;
  distanceKm?: number;
  distanceMiles?: number;
  optionalAdders?: OptionalAdderEstimate[];
  pricingMode?: PricingMode;
  baseLabel?: string;
  baseSource?: FallbackSource;
  proxyLabel?: string;
  estimatedTotalMedian?: number;
  estimatedTotalMin?: number;
  estimatedTotalMax?: number;

  // Medicare benchmark (CMS Physician Fee Schedule)
  medicareFacilityRate?: number;
  medicareMultiplier?: number;
  medicareMultiplierSource?: "cash" | "insured" | "gross";

  // Episode bundling (Turquoise SSP)
  episodeEstimate?: EpisodeEstimate;
}

// -- Charge Variant (lightweight subset for grouped display) --
export interface ChargeVariant {
  id: string;
  description?: string;
  billingClass?: string;
  setting?: ChargeSetting;
  laterality?: Laterality;
  bodySite?: BodySite;
  cashPrice?: number;
  grossCharge?: number;
  avgNegotiatedRate?: number;
  minPrice?: number;
  maxPrice?: number;
  payerCount?: number;
  isDiscounted?: boolean;
}

// -- Grouped Charge Result (multiple charges at same provider collapsed into one card) --
export interface GroupedChargeResult extends ChargeResult {
  chargeVariants: ChargeVariant[];
  variantCount: number;
}

// -- Episode Estimate (Turquoise SSP-based all-in cost estimate) --
export interface EpisodeEstimate {
  episodeId: string;
  principalCode: string;
  label: string;
  category?: string;
  estimatedAllInMedian?: number;
  estimatedAllInMin?: number;
  estimatedAllInMax?: number;
  componentCount: number;
  priceableCount: number;
  coverageRatio: number;
  source: "turquoise_ssp";
}

// -- Medicare Benchmark (CMS Physician Fee Schedule national rate) --
export interface MedicareBenchmark {
  code: string;
  description?: string;
  facilityRate?: number;
  nonFacilityRate?: number;
  pfsYear: number;
}

// -- Payer Rate (insurance-specific negotiated rate for a charge) --
export interface PayerRate {
  payerName: string;
  planName?: string;
  rate?: number;
  methodology?: string;
}

// -- Search Query (user input) --
export interface SearchQuery {
  query: string;
  location: {
    zip?: string;
    lat?: number;
    lng?: number;
    city?: string;
    state?: string;
  };
  radiusMiles?: number;
}

// -- Search Result (full response from search API) --
export interface SearchResult {
  cptCodes: CPTCode[];
  results: ChargeResult[];
  query: string;
  location: string;
  interpretation?: string;
  pricingPlan?: PricingPlan;
  totalResults: number;
  hasEpisodeEstimates?: boolean;
}

// -- Guided Search: Clarification Flow Types --

export interface ClarificationOption {
  label: string;
  description?: string;
  codes?: string[]; // Billing codes this resolves to (if terminal)
  codeType?: BillingCodeType;
  refinedQuery?: string; // Rewritten query for re-interpretation
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  helpText?: string;
  options: ClarificationOption[];
  allowFreeText?: boolean; // Default: true — always show "Other" input
}

export interface ClarificationTurn {
  questionId: string;
  selectedOption: string; // Label of selected option, or "other"
  freeText?: string; // What user typed if "other"
}

export interface TranslationResponse {
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
  confidence: ConfidenceLevel;
  queryType?: QueryType;
  pricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
  nextQuestion?: ClarificationQuestion;
  conversationComplete?: boolean;
}

// -- Saved Search (user bookmark) --
export interface SavedSearch {
  id: string;
  user_id: string;
  query: string;
  location: string;
  cpt_codes: string[];
  lat?: number;
  lng?: number;
  created_at: string;
}
