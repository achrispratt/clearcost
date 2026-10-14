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

  // What Medicare pays the doctor (CMS Physician Fee Schedule facility rate).
  // Only set for surgery and visit codes; never a hospital-price benchmark.
  medicareFacilityRate?: number;

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
/** The single billing class every line item of an episode estimate is in. */
export type EpisodeBillingClass = "facility" | "professional";

/**
 * Where a line's cash-equivalent price came from:
 * - cash: the hospital's own published cash price
 * - insured_converted: avg negotiated rate x a cash/insured ratio
 * - gross_converted: gross charge x a cash/gross ratio
 */
export type EpisodeLineSource =
  | "cash"
  | "insured_converted"
  | "gross_converted";

export type EpisodeConfidence = "high" | "medium" | "low";

/** One priced line of an episode estimate, always in cash-equivalent dollars. */
export interface EpisodeLine {
  code: string;
  isPrincipal: boolean;
  source: EpisodeLineSource;
  confidence: EpisodeConfidence;
  /** Whether the conversion ratio is this hospital's own or a national fallback. */
  ratioScope?: "hospital" | "national";
  estimate: number;
  min: number;
  max: number;
}

export interface EpisodeEstimate {
  episodeId: string;
  principalCode: string;
  label: string;
  category?: string;
  /** Cash-equivalent all-in total (sum of line estimates). */
  estimatedAllInMedian?: number;
  estimatedAllInMin?: number;
  estimatedAllInMax?: number;
  componentCount: number;
  priceableCount: number;
  coverageRatio: number; // priced components (cash or converted) / all components
  cashCoverageRatio: number; // components priced from a real cash price / all components
  confidence: EpisodeConfidence;
  billingClass: EpisodeBillingClass;
  lines: EpisodeLine[];
  /** Component codes this hospital has no usable price for. */
  missingCodes: string[];
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
  kbSessionId?: string; // KB session ID for event tracking
  kbPathHash?: string; // KB path hash for event tracking
  canonicalMatch?: string; // Synonym clustering: matched existing canonical query
}

// -- Knowledge Base (Translation KB) --
export type KBNodeType = "question" | "resolution";
export type KBSource = "claude" | "admin" | "migrated";
export type KBEventType = "walk" | "result_click" | "save" | "bounce" | "skip";

export interface KBSynonym {
  query_hash: string;
  normalized_query: string;
  canonical_query: string;
  created_at: string;
}

export interface KBNode {
  path_hash: string;
  canonical_query: string;
  answer_path: string[];
  depth: number;
  node_type: KBNodeType;
  payload: KBQuestionPayload | KBResolutionPayload;
  hit_count: number;
  version: number;
  source: KBSource;
  created_at: string;
  updated_at: string;
}

export interface KBQuestionPayload {
  type: "question";
  question: ClarificationQuestion;
  interpretation?: string;
  codes?: CPTCode[];
  pricingPlan?: PricingPlan;
  confidence: ConfidenceLevel;
}

export interface KBResolutionPayload {
  type: "resolution";
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
  queryType?: QueryType;
  pricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
  confidence: ConfidenceLevel;
  conversationComplete: boolean;
}

export interface KBLookupResult {
  hit: boolean;
  canonical_query?: string;
  path_hash?: string;
  node?: KBNode;
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
