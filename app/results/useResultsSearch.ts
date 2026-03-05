"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ChargeResult,
  CPTCode,
  BillingCodeType,
  PricingPlan,
} from "@/types";

type DirectCodeGroup = {
  codeType: BillingCodeType;
  codes: string[];
};

function parseCodeGroups(raw: string): DirectCodeGroup[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (group): group is { codeType: unknown; codes: unknown } =>
          !!group && typeof group === "object"
      )
      .map((group) => {
        const rawCodeType = group.codeType;
        const codeType: BillingCodeType =
          rawCodeType === "hcpcs" || rawCodeType === "ms_drg"
            ? rawCodeType
            : "cpt";
        const codes = Array.isArray(group.codes)
          ? group.codes.filter(
              (code): code is string =>
                typeof code === "string" && code.trim().length > 0
            )
          : [];
        return { codeType, codes };
      })
      .filter((group) => group.codes.length > 0);
  } catch {
    return [];
  }
}

function parsePricingPlan(raw: string): PricingPlan | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as PricingPlan;
  } catch {
    return undefined;
  }
}

export function useResultsSearch() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const locationDisplay = searchParams.get("loc") || "";
  const directCodeGroupsParam = searchParams.get("codeGroups") || "";
  const directCodeGroups = parseCodeGroups(directCodeGroupsParam);
  const directCodes =
    searchParams.get("codes")?.split(",").filter(Boolean) || [];
  const directCodeType = searchParams.get("codeType") || "";
  const directInterp = searchParams.get("interp") || "";
  const directPlanParam = searchParams.get("plan") || "";
  const directPlan = parsePricingPlan(directPlanParam);
  const directCodeDescsParam = searchParams.get("codeDescs") || "";

  const [results, setResults] = useState<ChargeResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ChargeResult[]>([]);
  const [cptCodes, setCptCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [pricingPlan, setPricingPlan] = useState<PricingPlan | undefined>(
    directPlan
  );
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [radius, setRadius] = useState<number>(25);

  useEffect(() => {
    if (
      (!query && directCodeGroups.length === 0 && directCodes.length === 0) ||
      !lat ||
      !lng
    )
      return;

    const search = async () => {
      setLoading(true);
      setError(null);

      const hasDirectCodes =
        directCodeGroups.length > 0 || directCodes.length > 0;
      setLoadingStage(
        hasDirectCodes
          ? "Finding prices near you..."
          : "Translating your query..."
      );

      try {
        const requestBody: Record<string, unknown> = {
          query,
          location: { lat, lng },
        };

        if (directInterp) {
          requestBody.interpretation = directInterp;
        }
        if (directPlan) {
          requestBody.pricingPlan = directPlan;
        }

        if (directCodeGroups.length > 0) {
          requestBody.codeGroups = directCodeGroups;
        } else if (hasDirectCodes) {
          requestBody.codes = directCodes;
          requestBody.codeType = directCodeType || "cpt";
        }

        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!hasDirectCodes) {
          setLoadingStage("Finding prices near you...");
        }

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Search failed");
        }

        const data = await response.json();
        setResults(data.results);
        setFilteredResults(data.results);

        // Reconstruct cptCodes from URL descriptions when API returns empty
        // (guided search passes codes directly, skipping AI translation)
        const apiCodes: CPTCode[] = data.cptCodes || [];
        if (apiCodes.length > 0) {
          setCptCodes(apiCodes);
        } else if (directCodeDescsParam) {
          try {
            const descs = JSON.parse(directCodeDescsParam) as Record<
              string,
              string
            >;
            const allCodes =
              directCodeGroups.length > 0
                ? directCodeGroups.flatMap((g) =>
                    g.codes.map((code) => ({ code, codeType: g.codeType }))
                  )
                : directCodes.map((code) => ({
                    code,
                    codeType: (directCodeType || "cpt") as BillingCodeType,
                  }));
            setCptCodes(
              allCodes
                .filter(({ code }) => descs[code])
                .map(({ code, codeType }) => ({
                  code,
                  description: descs[code],
                  category: "Procedure",
                  codeType,
                }))
            );
          } catch {
            setCptCodes([]);
          }
        } else {
          setCptCodes([]);
        }

        setInterpretation(data.interpretation || directInterp);
        setPricingPlan(data.pricingPlan || directPlan);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
        setLoadingStage("");
      }
    };

    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    lat,
    lng,
    directCodeGroupsParam,
    directCodes.join(","),
    directCodeType,
    directInterp,
    directPlanParam,
  ]);

  const handleNewSearch = (
    newQuery: string,
    location: { lat: number; lng: number; display: string }
  ) => {
    const params = new URLSearchParams({
      q: newQuery,
      lat: location.lat.toString(),
      lng: location.lng.toString(),
      loc: location.display,
    });
    window.location.href = `/guided-search?${params.toString()}`;
  };

  const handleFilteredResults = useCallback((filtered: ChargeResult[]) => {
    setFilteredResults(filtered);
  }, []);

  const handleRadiusChange = useCallback((newRadius: number) => {
    setRadius(newRadius);
  }, []);

  return {
    query,
    lat,
    lng,
    locationDisplay,
    results,
    filteredResults,
    cptCodes,
    interpretation,
    pricingPlan,
    loading,
    loadingStage,
    error,
    view,
    setView,
    handleNewSearch,
    handleFilteredResults,
    radius,
    handleRadiusChange,
  };
}
