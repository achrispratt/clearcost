import { NextRequest, NextResponse } from "next/server";
import { translateQueryToCPT } from "@/lib/cpt/translate";
import { kbLookup, resolutionPayloadToTranslation } from "@/lib/kb/lookup";
import { writeResolutionToKB } from "@/lib/kb/write-back";
import { normalizeQuery } from "@/lib/kb/path-hash";
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
        return NextResponse.json(resolutionPayloadToTranslation(payload));
      }
    }

    const result = await translateQueryToCPT(query);

    const canonicalQuery = kbResult.canonical_query || normalizeQuery(query);
    writeResolutionToKB({ query, canonicalQuery, result }).catch((err) =>
      console.error("KB write-back failed:", err)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("CPT translation error:", error);
    return NextResponse.json(
      { error: "Failed to translate query" },
      { status: 500 }
    );
  }
}
