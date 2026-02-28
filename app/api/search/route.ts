import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { lookupChargesWithFallback } from "@/lib/cpt/lookup";
import { handleApiError } from "@/lib/api-helpers";
import type { BillingCodeType } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, location, codes: directCodes, codeType: directCodeType } = body;

    if (!location) {
      return NextResponse.json(
        { error: "Location is required" },
        { status: 400 }
      );
    }

    const radiusMiles = location.radiusMiles || 25;
    const { lat, lng } = location;

    // Fast path: direct code lookup (from guided search flow)
    // Skips AI translation entirely — codes are already known
    if (directCodes && directCodes.length > 0) {
      const results = await lookupChargesWithFallback({
        codeGroups: [{ codeType: directCodeType || "cpt", codes: directCodes }],
        lat,
        lng,
        radiusMiles,
        descriptionFallback: query,
      });

      return NextResponse.json({
        query: query || "",
        interpretation: "",
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
    const { codes, interpretation, searchTerms } =
      await translateQueryToCPT(query);

    if (codes.length === 0) {
      return NextResponse.json(
        { error: "Could not identify relevant procedures for your query" },
        { status: 404 }
      );
    }

    // Step 2: Group codes by type and look up with cascading fallback
    const codesByType = new Map<BillingCodeType, string[]>();
    for (const code of codes) {
      const type = code.codeType || "cpt";
      const existing = codesByType.get(type) || [];
      existing.push(code.code);
      codesByType.set(type, existing);
    }

    const codeGroups = Array.from(codesByType.entries()).map(
      ([codeType, codeList]) => ({ codeType, codes: codeList })
    );

    const results = await lookupChargesWithFallback({
      codeGroups,
      lat,
      lng,
      radiusMiles,
      descriptionFallback: searchTerms,
    });

    return NextResponse.json({
      query,
      interpretation,
      cptCodes: codes,
      results,
      totalResults: results.length,
    });
  } catch (error) {
    return handleApiError(error, "POST /api/search");
  }
}
