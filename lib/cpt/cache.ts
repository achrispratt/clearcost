import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import type {
  BodySite,
  CPTCode,
  Laterality,
  PricingPlan,
  QueryType,
} from "@/types";

export interface TranslationCachePayload {
  codes: CPTCode[];
  interpretation: string;
  searchTerms?: string;
  queryType?: QueryType;
  pricingPlan?: PricingPlan;
  laterality?: Laterality;
  bodySite?: BodySite;
}

export interface TranslationCacheLookup {
  queryHash: string;
  normalizedQuery: string;
  hit: boolean;
  payload?: TranslationCachePayload;
}

export function normalizeQueryForCache(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getTranslationCacheKey(query: string): {
  normalizedQuery: string;
  queryHash: string;
} {
  const normalizedQuery = normalizeQueryForCache(query);
  const queryHash = createHash("sha256").update(normalizedQuery).digest("hex");
  return { normalizedQuery, queryHash };
}

function isTranslationCachePayload(
  value: unknown
): value is TranslationCachePayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.codes) &&
    typeof candidate.interpretation === "string"
  );
}

export async function getCachedTranslation(
  query: string
): Promise<TranslationCacheLookup> {
  const { normalizedQuery, queryHash } = getTranslationCacheKey(query);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("translation_cache")
    .select("payload, hit_count")
    .eq("query_hash", queryHash)
    .maybeSingle();

  if (error || !data || !isTranslationCachePayload(data.payload)) {
    return { queryHash, normalizedQuery, hit: false };
  }

  const nextHitCount =
    typeof data.hit_count === "number" ? data.hit_count + 1 : 1;
  const { error: updateError } = await supabase
    .from("translation_cache")
    .update({
      hit_count: nextHitCount,
      updated_at: new Date().toISOString(),
    })
    .eq("query_hash", queryHash);

  if (updateError) {
    console.error("translation_cache hit_count update failed:", updateError);
  }

  return {
    queryHash,
    normalizedQuery,
    hit: true,
    payload: data.payload,
  };
}

export async function setCachedTranslation(
  query: string,
  payload: TranslationCachePayload
): Promise<void> {
  const { normalizedQuery, queryHash } = getTranslationCacheKey(query);
  const supabase = await createClient();

  const { error } = await supabase.from("translation_cache").upsert(
    {
      query_hash: queryHash,
      normalized_query: normalizedQuery,
      payload,
      hit_count: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "query_hash" }
  );

  if (error) {
    console.error("translation_cache upsert failed:", error);
  }
}
