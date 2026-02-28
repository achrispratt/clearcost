import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { lookupWithPricingPlan } from "@/lib/cpt/lookup";
import { buildPricingPlan, normalizePricingPlanInput } from "@/lib/cpt/pricing-plan";
import { handleApiError } from "@/lib/api-helpers";
import type { BillingCodeType, CPTCode } from "@/types";

function normalizeCodeType(value: unknown): BillingCodeType {
  if (value === "hcpcs" || value === "ms_drg") return value;
  return "cpt";
}

function normalizeCodeGroups(value: unknown): { codeType: BillingCodeType; codes: string[] }[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((group): group is { codeType?: unknown; codes?: unknown } =>
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

export async function POST(request: NextRequest) {
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

    if (!location) {
      return NextResponse.json(
        { error: "Location is required" },
        { status: 400 }
      );
    }

    const radiusMiles = location.radiusMiles || 25;
    const { lat, lng } = location;
    const directCodeGroups = normalizeCodeGroups(directCodeGroupsRaw);
    const normalizedDirectCodes = Array.isArray(directCodes)
      ? directCodes.filter(
          (code): code is string =>
            typeof code === "string" && code.trim().length > 0
        )
      : [];
    const providedPricingPlan = normalizePricingPlanInput(providedPricingPlanRaw);

    // Fast path: direct code lookup (from guided search flow)
    // Skips AI translation entirely — codes are already known
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
        query: query || "",
        interpretation: providedInterpretation,
        codes: directPlanCodes,
        modelPricingPlan: providedPricingPlan,
      });

      const results = await lookupWithPricingPlan({
        pricingPlan,
        lat,
        lng,
        radiusMiles,
        descriptionFallback: query || providedInterpretation,
      });

      return NextResponse.json({
        query: query || "",
        interpretation: providedInterpretation || "",
        pricingPlan,
        cptCodes: [],
        results,
        totalResults: results.length,
      });
    }

    if (normalizedDirectCodes.length > 0) {
      const codeType = normalizeCodeType(directCodeType);
      const directPlanCodes: CPTCode[] = normalizedDirectCodes.map((code) => ({
        code,
        codeType,
        description: "",
        category: "Procedure",
      }));
      const pricingPlan = buildPricingPlan({
        query: query || "",
        interpretation: providedInterpretation,
        codes: directPlanCodes,
        modelPricingPlan: providedPricingPlan,
      });

      const results = await lookupWithPricingPlan({
        pricingPlan,
        lat,
        lng,
        radiusMiles,
        descriptionFallback: query || providedInterpretation,
      });

      return NextResponse.json({
        query: query || "",
        interpretation: providedInterpretation || "",
        pricingPlan,
        cptCodes: [],
        results,
        totalResults: results.length,
      });
    }

    // Standard path: AI translation → code lookup → fallback
    if (!query) {
      return NextResponse.json(
        { error: "Query or codes are required" },
        { status: 400 }
      );
    }

    // Step 1: Translate plain English to billing codes via Claude
    const {
      codes,
      interpretation,
      searchTerms,
      queryType,
      pricingPlan: translatedPricingPlan,
    } =
      await translateQueryToCPT(query);

    const pricingPlan = buildPricingPlan({
      query,
      interpretation,
      queryType: providedPricingPlan?.queryType || queryType,
      codes,
      modelPricingPlan: providedPricingPlan || translatedPricingPlan,
    });

    const hasSearchablePlan =
      pricingPlan.baseCodeGroups.length > 0 ||
      pricingPlan.adders.some((adder) => adder.codeGroups.length > 0);
    if (!hasSearchablePlan) {
      return NextResponse.json(
        { error: "Could not identify relevant procedures for your query" },
        { status: 404 }
      );
    }

    const results = await lookupWithPricingPlan({
      pricingPlan,
      lat,
      lng,
      radiusMiles,
      descriptionFallback: searchTerms,
    });

    return NextResponse.json({
      query,
      interpretation,
      pricingPlan,
      cptCodes: codes,
      results,
      totalResults: results.length,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/search");
  }
}
