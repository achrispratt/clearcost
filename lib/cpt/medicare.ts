import { createClient } from "@/lib/supabase/server";
import type { MedicareBenchmark } from "@/types";

export async function lookupMedicareBenchmarks(
  codes: string[]
): Promise<Map<string, MedicareBenchmark>> {
  const normalized = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
  if (normalized.length === 0) return new Map();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("medicare_benchmarks")
      .select("code, description, facility_rate, non_facility_rate, pfs_year")
      .in("code", normalized);

    if (error) {
      console.warn("Medicare benchmark lookup failed:", error.message);
      return new Map();
    }

    const map = new Map<string, MedicareBenchmark>();
    for (const row of data ?? []) {
      map.set(row.code, {
        code: row.code,
        description: row.description ?? undefined,
        facilityRate:
          row.facility_rate != null ? Number(row.facility_rate) : undefined,
        nonFacilityRate:
          row.non_facility_rate != null
            ? Number(row.non_facility_rate)
            : undefined,
        pfsYear: row.pfs_year,
      });
    }
    return map;
  } catch (err) {
    console.warn("Medicare benchmark lookup error:", err);
    return new Map();
  }
}
