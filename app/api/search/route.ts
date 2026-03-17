import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import {
  createLookupDiagnostics,
  lookupWithPricingPlan,
  type LookupDiagnostics,
} from "@/lib/cpt/lookup";
import {
  buildPricingPlan,
  normalizePricingPlanInput,
} from "@/lib/cpt/pricing-plan";
import { kbLookup, resolutionPayloadToTranslation } from "@/lib/kb/lookup";
import { writeResolutionToKB } from "@/lib/kb/write-back";
import { normalizeQuery, computeQueryHash } from "@/lib/kb/path-hash";
import { normalizeCodeType } from "@/lib/cpt/body-site-laterality-constants";
import { lookupMedicareBenchmarks } from "@/lib/cpt/medicare";
import { groupResultsByProvider } from "@/lib/cpt/group-results";
import { enrichWithEpisodeEstimates } from "@/lib/cpt/episode";
import { getDisplayPrice } from "@/lib/format";
import { handleApiError } from "@/lib/api-helpers";
import type {
  BillingCodeType,
  ChargeResult,
  CPTCode,
  KBResolutionPayload,
  PricingPlan,
} from "@/types";

const SPARSE_RESULT_THRESHOLD = 3;
const EXPANDED_RADIUS_MILES = 250;

async function enrichAndGroup(results: ChargeResult[]) {
  const [withMedicare, withEpisodes] = await Promise.all([
    enrichWithMedicareBenchmarks(results),
    enrichWithEpisodeEstimates(results),
  ]);
  // Merge: Medicare writes medicareFacilityRate/Multiplier, episodes write episodeEstimate
  const merged = withMedicare.map((r, i) => ({
    ...r,
    episodeEstimate: withEpisodes[i]?.episodeEstimate,
  }));
  return groupResultsByProvider(merged);
}

async function lookupWithAutoExpand(
  params: Parameters<typeof lookupWithPricingPlan>[0]
) {
  const results = await lookupWithPricingPlan(params);
  if (results.length >= SPARSE_RESULT_THRESHOLD) return results;
  if ((params.radiusMiles ?? 100) >= EXPANDED_RADIUS_MILES) return results;
  return lookupWithPricingPlan({
    ...params,
    radiusMiles: EXPANDED_RADIUS_MILES,
  });
}

type CacheStatus = "hit" | "miss" | "skip";

function normalizeCodeGroups(
  value: unknown
): { codeType: BillingCodeType; codes: string[] }[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (group): group is { codeType?: unknown; codes?: unknown } =>
        !!group && typeof group === "object"
    )
    .map((group) => ({
      codeType: normalizeCodeType(group.codeType),
      codes: Array.isArray(group.codes)
        ? group.codes.filter(
            (code): code is string =>
              typeof code === "string" && code.trim().length > 0
          )
        : [],
    }))
    .filter((group) => group.codes.length > 0);
}

function countCodesInPlan(pricingPlan: PricingPlan): {
  baseGroupCount: number;
  baseCodeCount: number;
  adderCount: number;
  adderGroupCount: number;
  adderCodeCount: number;
} {
  return {
    baseGroupCount: pricingPlan.baseCodeGroups.length,
    baseCodeCount: pricingPlan.baseCodeGroups.reduce(
      (sum, group) => sum + group.codes.length,
      0
    ),
    adderCount: pricingPlan.adders.length,
    adderGroupCount: pricingPlan.adders.reduce(
      (sum, adder) => sum + adder.codeGroups.length,
      0
    ),
    adderCodeCount: pricingPlan.adders.reduce(
      (sum, adder) =>
        sum +
        adder.codeGroups.reduce(
          (innerSum, group) => innerSum + group.codes.length,
          0
        ),
      0
    ),
  };
}

function maybeLogSearchDiagnostics({
  traceId,
  queryHash,
  cacheStatus,
  pricingPlan,
  lookupDiagnostics,
  totalResults,
  elapsedMs,
}: {
  traceId: string;
  queryHash?: string;
  cacheStatus: CacheStatus;
  pricingPlan?: PricingPlan;
  lookupDiagnostics: LookupDiagnostics;
  totalResults: number;
  elapsedMs: number;
}): void {
  const hasTimeouts = lookupDiagnostics.totalTimeouts > 0;
  const fallbackExhausted =
    lookupDiagnostics.fallbackExhausted ||
    lookupDiagnostics.stageSummaries.some(
      (stage) => stage.stage === "base" && stage.exhausted
    );

  if (!hasTimeouts && totalResults > 0 && !fallbackExhausted) return;

  const planCounts = pricingPlan ? countCodesInPlan(pricingPlan) : undefined;
  console.warn("search_diagnostics", {
    traceId,
    queryHash,
    cacheStatus,
    elapsedMs,
    totalResults,
    pricingMode: pricingPlan?.mode,
    queryType: pricingPlan?.queryType,
    ...planCounts,
    totalRpcAttempts: lookupDiagnostics.totalRpcAttempts,
    totalRetries: lookupDiagnostics.totalRetries,
    totalTimeouts: lookupDiagnostics.totalTimeouts,
    totalFailures: lookupDiagnostics.totalFailures,
    totalChunkFallbacks: lookupDiagnostics.totalChunkFallbacks,
    fallbackExhausted,
    stageSummaries: lookupDiagnostics.stageSummaries.map((stage) => ({
      stage: stage.stage,
      attempts: stage.attempts,
      retries: stage.retries,
      timeouts: stage.timeouts,
      failures: stage.failures,
      chunkFallbacks: stage.chunkFallbacks,
      initialResults: stage.initialResults,
      expandedResults: stage.expandedResults,
      descriptionResults: stage.descriptionResults,
      usedExpandedRadius: stage.usedExpandedRadius,
      usedDescriptionFallback: stage.usedDescriptionFallback,
      exhausted: stage.exhausted,
    })),
  });
}

async function enrichWithMedicareBenchmarks(
  results: ChargeResult[]
): Promise<ChargeResult[]> {
  const codes = results.flatMap(
    (r) => [r.cpt, r.hcpcs].filter(Boolean) as string[]
  );
  if (codes.length === 0) return results;

  const benchmarks = await lookupMedicareBenchmarks(codes);
  if (benchmarks.size === 0) return results;

  return results.map((result) => {
    const code = result.cpt || result.hcpcs;
    if (!code) return result;
    const bm = benchmarks.get(code.trim().toUpperCase());
    // Use non-facility rate (total service value: work + PE + MP).
    // Facility rate only covers the physician component — not a fair comparison to hospital all-in charges.
    const benchmarkRate = bm?.nonFacilityRate ?? bm?.facilityRate;
    if (!benchmarkRate) return result;

    const dp = getDisplayPrice(result);
    const priceSource = dp.type === "unavailable" ? undefined : dp.type;
    const multiplier =
      dp.amount && benchmarkRate > 0
        ? Math.round((dp.amount / benchmarkRate) * 10) / 10
        : undefined;

    return {
      ...result,
      medicareFacilityRate: benchmarkRate,
      medicareMultiplier: multiplier,
      medicareMultiplierSource: priceSource,
    };
  });
}

export async function POST(request: NextRequest) {
  const traceId = randomUUID();
  const startedAt = Date.now();

  const respond = (payload: unknown, status = 200) => {
    const response = NextResponse.json(payload, { status });
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("x-clearcost-trace-id", traceId);
    }
    return response;
  };

  try {
    const body = await request.json();
    const {
      query,
      interpretation: providedInterpretation,
      pricingPlan: providedPricingPlanRaw,
      location,
      codes: directCodes,
      codeType: directCodeType,
      codeGroups: directCodeGroupsRaw,
    } = body;
    const queryText = typeof query === "string" ? query : "";

    if (!location) {
      return respond({ error: "Location is required" }, 400);
    }

    const radiusMiles = location.radiusMiles || 100;
    const { lat, lng } = location;
    const directCodeGroups = normalizeCodeGroups(directCodeGroupsRaw);
    const normalizedDirectCodes = Array.isArray(directCodes)
      ? directCodes.filter(
          (code): code is string =>
            typeof code === "string" && code.trim().length > 0
        )
      : [];
    const providedPricingPlan = normalizePricingPlanInput(
      providedPricingPlanRaw
    );

    // Fast path: direct grouped codes, skips AI translation.
    if (directCodeGroups.length > 0) {
      const directPlanCodes: CPTCode[] = directCodeGroups.flatMap((group) =>
        group.codes.map((code) => ({
          code,
          codeType: group.codeType,
          description: "",
          category: "Procedure",
        }))
      );
      const pricingPlan = buildPricingPlan({
        query: queryText,
        interpretation: providedInterpretation,
        codes: directPlanCodes,
        modelPricingPlan: providedPricingPlan,
      });
      const lookupDiagnostics = createLookupDiagnostics();

      const results = await lookupWithAutoExpand({
        pricingPlan,
        lat,
        lng,
        radiusMiles,
        descriptionFallback: queryText || providedInterpretation,
        diagnostics: lookupDiagnostics,
      });

      maybeLogSearchDiagnostics({
        traceId,
        queryHash: queryText
          ? computeQueryHash(queryText).queryHash
          : undefined,
        cacheStatus: "skip",
        pricingPlan,
        lookupDiagnostics,
        totalResults: results.length,
        elapsedMs: Date.now() - startedAt,
      });

      const grouped = await enrichAndGroup(results);
      return respond({
        query: queryText,
        interpretation: providedInterpretation || "",
        pricingPlan,
        cptCodes: [],
        results: grouped,
        totalResults: grouped.length,
        hasEpisodeEstimates: grouped.some((r) => r.episodeEstimate != null),
      });
    }

    // Fast path: direct codes, skips AI translation.
    if (normalizedDirectCodes.length > 0) {
      const codeType = normalizeCodeType(directCodeType);
      const directPlanCodes: CPTCode[] = normalizedDirectCodes.map((code) => ({
        code,
        codeType,
        description: "",
        category: "Procedure",
      }));
      const pricingPlan = buildPricingPlan({
        query: queryText,
        interpretation: providedInterpretation,
        codes: directPlanCodes,
        modelPricingPlan: providedPricingPlan,
      });
      const lookupDiagnostics = createLookupDiagnostics();

      const results = await lookupWithAutoExpand({
        pricingPlan,
        lat,
        lng,
        radiusMiles,
        descriptionFallback: queryText || providedInterpretation,
        diagnostics: lookupDiagnostics,
      });

      maybeLogSearchDiagnostics({
        traceId,
        queryHash: queryText
          ? computeQueryHash(queryText).queryHash
          : undefined,
        cacheStatus: "skip",
        pricingPlan,
        lookupDiagnostics,
        totalResults: results.length,
        elapsedMs: Date.now() - startedAt,
      });

      const grouped = await enrichAndGroup(results);
      return respond({
        query: queryText,
        interpretation: providedInterpretation || "",
        pricingPlan,
        cptCodes: [],
        results: grouped,
        totalResults: grouped.length,
        hasEpisodeEstimates: grouped.some((r) => r.episodeEstimate != null),
      });
    }

    // Standard path: AI translation -> code lookup -> fallback search.
    if (!queryText) {
      return respond({ error: "Query or codes are required" }, 400);
    }

    const kbResult = await kbLookup(queryText, []);
    const queryHash = kbResult.queryHash;
    const cacheStatus: CacheStatus = kbResult.hit ? "hit" : "miss";

    let translated;
    if (kbResult.hit && kbResult.node) {
      const payload = kbResult.node.payload as KBResolutionPayload;
      if (payload.type === "resolution") {
        translated = resolutionPayloadToTranslation(payload);
      }
    }
    if (!translated) {
      translated = await translateQueryToCPT(queryText);
    }

    const pricingPlan = buildPricingPlan({
      query: queryText,
      interpretation: translated.interpretation,
      queryType: providedPricingPlan?.queryType || translated.queryType,
      codes: translated.codes,
      modelPricingPlan: providedPricingPlan || translated.pricingPlan,
      laterality: translated.laterality,
      bodySite: translated.bodySite,
    });

    const hasSearchablePlan =
      pricingPlan.baseCodeGroups.length > 0 ||
      pricingPlan.adders.some((adder) => adder.codeGroups.length > 0);
    if (!hasSearchablePlan) {
      return respond(
        { error: "Could not identify relevant procedures for your query" },
        404
      );
    }

    const lookupDiagnostics = createLookupDiagnostics();
    const results = await lookupWithAutoExpand({
      pricingPlan,
      lat,
      lng,
      radiusMiles,
      descriptionFallback: translated.searchTerms,
      diagnostics: lookupDiagnostics,
    });

    if (!kbResult.hit && results.length > 0) {
      const canonicalQuery =
        kbResult.canonical_query || normalizeQuery(queryText);
      writeResolutionToKB({
        query: queryText,
        canonicalQuery,
        result: translated,
      }).catch((err) => console.error("KB write-back failed:", err));
    }

    maybeLogSearchDiagnostics({
      traceId,
      queryHash,
      cacheStatus,
      pricingPlan,
      lookupDiagnostics,
      totalResults: results.length,
      elapsedMs: Date.now() - startedAt,
    });

    const grouped = await enrichAndGroup(results);
    return respond({
      query: queryText,
      interpretation: translated.interpretation,
      pricingPlan,
      cptCodes: translated.codes,
      results: grouped,
      totalResults: grouped.length,
      hasEpisodeEstimates: grouped.some((r) => r.episodeEstimate != null),
    });
  } catch (error) {
    const response = handleApiError(error, "POST /api/search");
    if (process.env.NODE_ENV !== "production") {
      response.headers.set("x-clearcost-trace-id", traceId);
    }
    return response;
  }
}
