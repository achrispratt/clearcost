"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  ClarificationTurn,
  ClarificationQuestion,
  CPTCode,
  BillingCodeType,
  PricingPlan,
  TranslationResponse,
} from "@/types";

type DirectCodeGroup = {
  codeType: BillingCodeType;
  codes: string[];
};

export function useClarificationState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const locationDisplay = searchParams.get("loc") || "";

  const [turns, setTurns] = useState<ClarificationTurn[]>([]);
  const [currentQuestion, setCurrentQuestion] =
    useState<ClarificationQuestion | null>(null);
  const [allCodes, setAllCodes] = useState<CPTCode[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const [pricingPlan, setPricingPlan] = useState<PricingPlan | undefined>(undefined);
  const [phase, setPhase] = useState<"loading" | "clarifying" | "resolved">(
    "loading"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");

  const responseCache = useRef<Map<string, TranslationResponse>>(new Map());

  const navigateToResults = useCallback(
    (params: URLSearchParams) => {
      router.push(`/results?${params.toString()}`);
    },
    [router]
  );

  const buildResultsParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams({
        q: query,
        lat: lat.toString(),
        lng: lng.toString(),
        loc: locationDisplay,
        ...extra,
      });
      return params;
    },
    [query, lat, lng, locationDisplay]
  );

  const goToResults = useCallback(
    (codes: CPTCode[], interp: string, plan?: PricingPlan) => {
      const codeValues = codes.map((c) => c.code);

      const codesByType = new Map<BillingCodeType, string[]>();
      for (const code of codes) {
        const type = code.codeType || "cpt";
        const existing = codesByType.get(type) || [];
        existing.push(code.code);
        codesByType.set(type, existing);
      }
      const codeGroups: DirectCodeGroup[] = Array.from(codesByType.entries()).map(
        ([codeType, groupedCodes]) => ({ codeType, codes: groupedCodes })
      );
      const codeType = codeGroups[0]?.codeType || "cpt";

      const codeDescs: Record<string, string> = {};
      for (const c of codes) {
        if (c.description) codeDescs[c.code] = c.description;
      }

      const extraParams: Record<string, string> = {
        codes: codeValues.join(","),
        codeType,
        codeGroups: JSON.stringify(codeGroups),
        interp,
        codeDescs: JSON.stringify(codeDescs),
      };
      if (plan) {
        extraParams.plan = JSON.stringify(plan);
      }

      navigateToResults(buildResultsParams(extraParams));
    },
    [navigateToResults, buildResultsParams]
  );

  const handleResponse = useCallback(
    (data: TranslationResponse) => {
      setInterpretation(data.interpretation || "");
      if (data.pricingPlan) {
        setPricingPlan(data.pricingPlan);
      }

      if (data.codes && data.codes.length > 0) {
        setAllCodes(data.codes);
      }

      if (data.confidence === "high" || data.conversationComplete) {
        if (data.codes && data.codes.length > 0) {
          goToResults(data.codes, data.interpretation || "", data.pricingPlan);
        } else {
          const extra: Record<string, string> = {};
          if (data.pricingPlan) {
            extra.plan = JSON.stringify(data.pricingPlan);
          }
          navigateToResults(buildResultsParams(extra));
        }
        return;
      }

      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setPhase("clarifying");
        setSelectedOption(null);
        setFreeText("");
      } else {
        navigateToResults(buildResultsParams());
      }
    },
    [goToResults, navigateToResults, buildResultsParams]
  );

  const fetchOrCacheQuestion = useCallback(
    async (turnsArray: ClarificationTurn[]) => {
      const cacheKey = JSON.stringify(turnsArray);

      const cached = responseCache.current.get(cacheKey);
      if (cached) {
        handleResponse(cached);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, turns: turnsArray }),
        });

        if (!response.ok) {
          throw new Error("Failed to process query");
        }

        const data: TranslationResponse = await response.json();
        responseCache.current.set(cacheKey, data);
        handleResponse(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong"
        );
        setPhase("clarifying");
      } finally {
        setLoading(false);
      }
    },
    [query, handleResponse]
  );

  useEffect(() => {
    if (!query || !lat || !lng) return;
    fetchOrCacheQuestion([]);
  }, [query, lat, lng, fetchOrCacheQuestion]);

  const handleSubmit = async () => {
    if (!currentQuestion) return;
    if (!selectedOption && !freeText.trim()) return;

    const newTurn: ClarificationTurn = {
      questionId: currentQuestion.id,
      selectedOption: freeText.trim() ? "other" : selectedOption || "",
      freeText: freeText.trim() || undefined,
    };

    const updatedTurns = [...turns, newTurn];
    setTurns(updatedTurns);
    fetchOrCacheQuestion(updatedTurns);
  };

  const handleBack = () => {
    if (turns.length === 0) {
      router.push("/");
      return;
    }

    const previousTurns = turns.slice(0, -1);
    setTurns(previousTurns);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion(previousTurns);
  };

  const handleBreadcrumbClick = (stepIndex: number) => {
    const targetTurns = turns.slice(0, stepIndex + 1);
    setTurns(targetTurns);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion(targetTurns);
  };

  const handleQueryBreadcrumbClick = () => {
    setTurns([]);
    setSelectedOption(null);
    setFreeText("");
    fetchOrCacheQuestion([]);
  };

  const handleSkip = () => {
    if (allCodes.length > 0) {
      goToResults(allCodes, interpretation, pricingPlan);
    } else {
      const extra: Record<string, string> = {};
      if (pricingPlan) {
        extra.plan = JSON.stringify(pricingPlan);
      }
      navigateToResults(buildResultsParams(extra));
    }
  };

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
    router.push(`/guided-search?${params.toString()}`);
  };

  const handleOptionSelect = (label: string) => {
    setSelectedOption(label);
    setFreeText("");
  };

  const handleFreeTextChange = (value: string) => {
    setFreeText(value);
    if (value.trim()) {
      setSelectedOption(null);
    }
  };

  return {
    query,
    lat,
    lng,
    locationDisplay,
    turns,
    currentQuestion,
    phase,
    loading,
    error,
    selectedOption,
    freeText,
    handleSubmit,
    handleBack,
    handleBreadcrumbClick,
    handleQueryBreadcrumbClick,
    handleSkip,
    handleNewSearch,
    handleOptionSelect,
    handleFreeTextChange,
  };
}
