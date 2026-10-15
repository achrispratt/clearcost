import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportError } from "@/lib/observability";

/**
 * GET /api/payers
 * Returns the list of available insurance payers for the filter dropdown.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("payers")
      .select("id, name, display_name")
      .order("display_name", { ascending: true });

    if (error) throw error;

    // Map snake_case DB columns to camelCase for frontend
    const payers = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
    }));

    return NextResponse.json(payers);
  } catch (error) {
    reportError(error, "Fetch payers error:");
    return NextResponse.json(
      { error: "Failed to fetch payers" },
      { status: 500 }
    );
  }
}
