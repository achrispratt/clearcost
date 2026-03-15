"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export function useResultSelection() {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
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

  // Called by MapView when a marker is clicked
  const handleMarkerClick = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);

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

  // Called by ResultCard when a card is clicked
  const handleCardSelect = useCallback(
    (providerId: string) => {
      setSelectedProviderId(providerId);
      resetTimer();
    },
    [resetTimer]
  );

  return { selectedProviderId, handleMarkerClick, handleCardSelect };
}
