import { NextRequest, NextResponse } from "next/server";
import { parseSearchContext } from "@/lib/saved-search-context";
import { validateQuery } from "@/lib/api-limits";
import { requireAuth, handleApiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error, "GET /api/saved");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;

    const body = await request.json();
    const { query, location, cptCodes, lat, lng, searchContext } = body ?? {};
    const context =
      searchContext === undefined
        ? undefined
        : parseSearchContext(searchContext);
    if (
      validateQuery(query) ||
      typeof location !== "string" ||
      location.length > 200 ||
      !Array.isArray(cptCodes) ||
      cptCodes.length > 50 ||
      !cptCodes.every(
        (c: unknown) => typeof c === "string" && /^[A-Z0-9]{1,7}$/.test(c)
      ) ||
      (lat != null &&
        (typeof lat !== "number" ||
          !Number.isFinite(lat) ||
          Math.abs(lat) > 90)) ||
      (lng != null &&
        (typeof lng !== "number" ||
          !Number.isFinite(lng) ||
          Math.abs(lng) > 180)) ||
      context === null
    ) {
      return NextResponse.json(
        { error: "Invalid saved search" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("saved_searches")
      .insert({
        user_id: user.id,
        query,
        location,
        cpt_codes: cptCodes,
        lat: lat ?? null,
        lng: lng ?? null,
        ...(context ? { search_context: context } : {}),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error, "POST /api/saved");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Search ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/saved");
  }
}
