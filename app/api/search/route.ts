import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { lookupCharges, lookupChargesByDescription } from "@/lib/cpt/lookup";
import type { BillingCodeType } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, location } = body;

    if (!query || !location) {
      return NextResponse.json(
        { error: "Query and location are required" },
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

    const radiusMiles = location.radiusMiles || 25;
    let allResults = [];

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
