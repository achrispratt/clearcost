import { createClient } from "@/lib/supabase/server";
import type { ChargeResult, BillingCodeType } from "@/types";

interface LookupParams {
  codes: string[];
  codeType?: BillingCodeType;
  lat: number;
  lng: number;
  radiusMiles?: number;
}

interface FallbackLookupParams {
  searchTerms: string;
  lat: number;
  lng: number;
  radiusMiles?: number;
  limit?: number;
}

/**
 * Primary search: Look up charges by billing code + geographic radius.
 * Calls the search_charges_nearby() RPC.
 *
 * The RPC handles cross-column search: when codeType is 'cpt', Postgres
 * checks both the cpt AND hcpcs columns (hospitals store CPT codes in either).
 */
export async function lookupCharges({
  codes,
  codeType = "cpt",
  lat,
  lng,
  radiusMiles = 25,
}: LookupParams): Promise<ChargeResult[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_charges_nearby", {
    p_code_type: codeType,
    p_codes: codes,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusMiles * 1.60934,
  });

  if (error) {
    console.error("Charge lookup error:", error);
    return [];
  }

  return mapRows(data || []);
}

/**
 * Fallback search: Look up charges by description text + geographic radius.
 * Used when code-based search returns zero results.
 * Calls the search_charges_by_description() RPC.
 */
export async function lookupChargesByDescription({
  searchTerms,
  lat,
  lng,
  radiusMiles = 25,
  limit = 50,
}: FallbackLookupParams): Promise<ChargeResult[]> {
  const supabase = await createClient();
  const radiusKm = radiusMiles * 1.60934;

  const { data, error } = await supabase.rpc("search_charges_by_description", {
    p_search_terms: searchTerms,
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_limit: limit,
  });

  if (error) {
    console.error("Description lookup error:", error);
    return [];
  }

  return mapRows(data || []);
}

// ---------------------------------------------------------------------------
// Row mapper: Supabase RPC result → ChargeResult
// ---------------------------------------------------------------------------

interface RpcRow {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_address: string | null;
  provider_city: string | null;
  provider_state: string | null;
  provider_zip: string | null;
  provider_lat: number | null;
  provider_lng: number | null;
  provider_phone: string | null;
  provider_website: string | null;
  provider_type: string | null;
  description: string | null;
  setting: string | null;
  billing_class: string | null;
  cpt: string | null;
  hcpcs: string | null;
  ms_drg: string | null;
  gross_charge: number | null;
  cash_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_negotiated_rate: number | null;
  min_negotiated_rate: number | null;
  max_negotiated_rate: number | null;
  payer_count: number | null;
  source: string | null;
  last_updated: string | null;
  distance_km: number | null;
}

function mapRows(rows: RpcRow[]): ChargeResult[] {
  return rows.map((row) => {
    const distanceKm = row.distance_km ?? undefined;
    const distanceMiles = distanceKm !== undefined ? distanceKm * 0.621371 : undefined;

    return {
      id: row.id,
      provider: {
        id: row.provider_id,
        name: row.provider_name,
        address: row.provider_address ?? undefined,
        city: row.provider_city ?? undefined,
        state: row.provider_state ?? undefined,
        zip: row.provider_zip ?? undefined,
        lat: row.provider_lat ?? undefined,
        lng: row.provider_lng ?? undefined,
        phone: row.provider_phone ?? undefined,
        website: row.provider_website ?? undefined,
        providerType: row.provider_type ?? undefined,
      },
      description: row.description ?? undefined,
      setting: row.setting as ChargeResult["setting"],
      billingClass: row.billing_class ?? undefined,
      cpt: row.cpt ?? undefined,
      hcpcs: row.hcpcs ?? undefined,
      msDrg: row.ms_drg ?? undefined,
      grossCharge: row.gross_charge ?? undefined,
      cashPrice: row.cash_price ?? undefined,
      minPrice: row.min_price ?? undefined,
      maxPrice: row.max_price ?? undefined,
      avgNegotiatedRate: row.avg_negotiated_rate ?? undefined,
      minNegotiatedRate: row.min_negotiated_rate ?? undefined,
      maxNegotiatedRate: row.max_negotiated_rate ?? undefined,
      payerCount: row.payer_count ?? undefined,
      source: row.source ?? undefined,
      lastUpdated: row.last_updated ?? undefined,
      distanceKm,
      distanceMiles,
    };
  });
}