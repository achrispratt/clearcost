"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PriceEntry } from "@/lib/results/summarize";
import { HospitalCard } from "./HospitalCard";

interface HospitalListProps {
  entries: PriceEntry[];
  lowestId?: string;
  selectedProviderId?: string | null;
  markerClickCount?: number;
  onCardSelect?: (providerId: string) => void;
  onResultClick?: () => void;
}

export function HospitalList({
  entries,
  lowestId,
  selectedProviderId,
  markerClickCount = 0,
  onCardSelect,
  onResultClick,
}: HospitalListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // A map pin opens that hospital's card and brings it into view. Keyed on
  // the click counter so selecting a card from the list doesn't re-trigger it.
  const [handledClickCount, setHandledClickCount] = useState(markerClickCount);
  if (markerClickCount !== handledClickCount) {
    setHandledClickCount(markerClickCount);
    const entry = selectedProviderId
      ? entries.find((e) =>
          e.locations.some((l) => l.provider.id === selectedProviderId)
        )
      : undefined;
    if (entry) setExpandedId(entry.primary.id);
  }

  useEffect(() => {
    if (markerClickCount === 0 || !expandedId) return;
    requestAnimationFrame(() => {
      itemRefs.current
        .get(expandedId)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerClickCount]);

  const toggle = useCallback(
    (entry: PriceEntry) => {
      setExpandedId((prev) =>
        prev === entry.primary.id ? null : entry.primary.id
      );
      onCardSelect?.(entry.primary.provider.id);
      onResultClick?.();
    },
    [onCardSelect, onResultClick]
  );

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <HospitalCard
          key={entry.primary.id}
          ref={(el) => {
            if (el) itemRefs.current.set(entry.primary.id, el);
            else itemRefs.current.delete(entry.primary.id);
          }}
          entry={entry}
          isLowest={entry.primary.id === lowestId}
          isSelected={
            !!selectedProviderId &&
            entry.locations.some((l) => l.provider.id === selectedProviderId)
          }
          isExpanded={expandedId === entry.primary.id}
          onToggle={() => toggle(entry)}
        />
      ))}
    </ul>
  );
}

export function HospitalListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading prices">
      <div
        className="rounded-2xl border p-6"
        style={{
          borderColor: "var(--cc-border)",
          background: "var(--cc-surface)",
        }}
      >
        <div className="h-3 w-40 shimmer mb-3" />
        <div className="h-10 w-64 max-w-full shimmer mb-4" />
        <div className="h-3 w-full shimmer mb-2" />
        <div className="h-3 w-3/4 shimmer" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-xl border px-4 py-4 flex justify-between gap-4"
          style={{
            borderColor: "var(--cc-border)",
            background: "var(--cc-surface)",
          }}
        >
          <div className="flex-1">
            <div className="h-4 w-48 max-w-full shimmer mb-2" />
            <div className="h-3 w-24 shimmer" />
          </div>
          <div className="h-5 w-16 shimmer" />
        </div>
      ))}
    </div>
  );
}
