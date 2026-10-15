import { createClient } from "@/lib/supabase/server";
import type { ChargeResult } from "@/types";

/**
 * CMS Overall Hospital Quality Star Ratings for the providers in a result
 * set (#141). Ratings are only stored for confident CMS matches, so a missing
 * rating means "not rated or not matched", never "low quality". Never fails
 * the search: on any error the results simply carry no ratings.
 */
export async function lookupStarRatings(
  results: ChargeResult[]
): Promise<Map<string, number>> {
  const ids = Array.from(new Set(results.map((r) => r.provider.id)));
  const ratings = new Map<string, number>();
  if (ids.length === 0) return ratings;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("providers")
      .select("id, cms_star_rating")
      .in("id", ids)
      .not("cms_star_rating", "is", null);
    if (error) throw error;
    for (const row of (data ?? []) as {
      id: string;
      cms_star_rating: number;
    }[]) {
      ratings.set(row.id, row.cms_star_rating);
    }
  } catch (err) {
    console.error("Star rating lookup failed:", err);
  }
  return ratings;
}
