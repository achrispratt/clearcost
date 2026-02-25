import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { lookupCharges, lookupChargesByDescription } from "@/lib/cpt/lookup";
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
    let allResults = [];

    // Fast path: direct code lookup (from guided search flow)
    // Skips AI translation entirely — codes are already known
    if (directCodes && directCodes.length > 0) {
      const results = await lookupCharges({
        codes: directCodes,
        codeType: directCodeType || "cpt",
        lat: location.lat,
        lng: location.lng,
        radiusMiles,
      });
      allResults.push(...results);

      return NextResponse.json({
        query: query || "",
        interpretation: "",
        cptCodes: [],
        results: allResults,
        totalResults: allResults.length,
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

    // Step 2: Look up charges by billing code near the user's location
    // Group codes by type (most will be CPT, but some may be HCPCS)
    const codesByType = new Map<BillingCodeType, string[]>();
    for (const code of codes) {
      const type = code.codeType || "cpt";
      const existing = codesByType.get(type) || [];
      existing.push(code.code);
      codesByType.set(type, existing);
    }

    // Query each code type
    for (const [codeType, codeList] of codesByType) {
      const results = await lookupCharges({
        codes: codeList,
        codeType,
        lat: location.lat,
        lng: location.lng,
        radiusMiles,
      });
      allResults.push(...results);
    }

    // Step 3: If code-based search returns zero results, fall back to description search
    if (allResults.length === 0 && searchTerms) {
      console.log(
        `Code-based search returned 0 results for "${query}". Falling back to description search: "${searchTerms}"`
      );
      allResults = await lookupChargesByDescription({
        searchTerms,
        lat: location.lat,
        lng: location.lng,
        radiusMiles,
      });
    }

    return NextResponse.json({
      query,
      interpretation,
      cptCodes: codes,
      results: allResults,
      totalResults: allResults.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "An error occurred while searching. Please try again." },
      { status: 500 }
    );
  }
}
