import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { kbLookup } from "@/lib/kb/lookup";
import type { KBResolutionPayload } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const kbResult = await kbLookup(query, []);

    if (kbResult.hit && kbResult.node) {
      const payload = kbResult.node.payload as KBResolutionPayload;
      if (payload.type === "resolution") {
        return NextResponse.json({
          codes: payload.codes,
          interpretation: payload.interpretation,
          searchTerms: payload.searchTerms,
          queryType: payload.queryType,
          pricingPlan: payload.pricingPlan,
          laterality: payload.laterality,
          bodySite: payload.bodySite,
        });
      }
    }

    const result = await translateQueryToCPT(query);
    return NextResponse.json(result);
  } catch (error) {
    console.error("CPT translation error:", error);
    return NextResponse.json(
      { error: "Failed to translate query" },
      { status: 500 }
    );
  }
}
