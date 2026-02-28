"use client";

import { useState, useCallback, useRef } from "react";
import type { ChargeResult } from "@/types";

export function useResultSelection() {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMarkerClick = useCallback((result: ChargeResult) => {
    setSelectedResultId(result.id);

    requestAnimationFrame(() => {
      const card = document.querySelector(`[data-result-id="${result.id}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(() => setSelectedResultId(null), 3000);
  }, []);

  return { selectedResultId, handleMarkerClick };
}
