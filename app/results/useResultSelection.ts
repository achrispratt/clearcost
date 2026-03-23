"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export function useResultSelection() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  // Counter (not boolean) so repeat clicks on the same marker re-expand collapsed siblings
  const [markerClickCount, setMarkerClickCount] = useState(0);
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    };
  }, []);

  const resetTimer = useCallback(() => {
    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current);
    selectionTimerRef.current = setTimeout(
      () => setSelectedProviderId(null),
      3000
    );
  }, []);

  const handleMarkerClick = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);
      setMarkerClickCount((c) => c + 1);

      requestAnimationFrame(() => {
        const card = document.querySelector(
          `[data-provider-id="${providerId}"]`
        );
        card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      resetTimer();
    },
    [resetTimer]
  );

  const handleCardSelect = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);
      resetTimer();
    },
    [resetTimer]
  );

  return {
    selectedProviderId,
    markerClickCount,
    handleMarkerClick,
    handleCardSelect,
  };
}
