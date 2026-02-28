"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { ChargeResult, CPTCode } from "@/types";

export function useResultsSearch() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const locationDisplay = searchParams.get("loc") || "";
  const directCodes = searchParams.get("codes")?.split(",").filter(Boolean) || [];
  const directCodeType = searchParams.get("codeType") || "";
  const directInterp = searchParams.get("interp") || "";

  const [results, setResults] = useState<ChargeResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<ChargeResult[]>([]);
  const [cptCodes, setCptCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if ((!query && directCodes.length === 0) || !lat || !lng) return;

    const search = async () => {
      setLoading(true);
      setError(null);

      const hasDirectCodes = directCodes.length > 0;
      setLoadingStage(hasDirectCodes ? "Finding prices near you..." : "Translating your query...");

      try {
        const requestBody: Record<string, unknown> = {
          query,
          location: { lat, lng },
        };

        if (hasDirectCodes) {
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
        setCptCodes(data.cptCodes || []);
        setInterpretation(data.interpretation || directInterp);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
        setLoadingStage("");
      }
    };

    search();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lat, lng, directCodes.join(","), directCodeType, directInterp]);

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

  return {
    query,
    lat,
    lng,
    locationDisplay,
    results,
    filteredResults,
    cptCodes,
    interpretation,
    loading,
    loadingStage,
    error,
    view,
    setView,
    handleNewSearch,
    handleFilteredResults,
  };
}
