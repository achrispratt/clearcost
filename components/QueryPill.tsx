"use client";

import { useState } from "react";
import { SearchBar } from "./SearchBar";

type Location = { lat: number; lng: number; display: string };

interface QueryPillProps {
  query: string;
  location?: Location;
  loading?: boolean;
  onSearch: (query: string, location: Location) => void;
}

/**
 * The current search, collapsed to one line. Tapping it opens the full
 * search form, so the question or answer below gets the screen.
 */
export function QueryPill({
  query,
  location,
  loading,
  onSearch,
}: QueryPillProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="animate-fade-in">
        <SearchBar
          onSearch={(q, loc) => {
            setEditing(false);
            onSearch(q, loc);
          }}
          loading={loading}
          initialQuery={query}
          initialLocation={location}
          compact
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-1 text-[13px] px-1 py-1"
          style={{ color: "var(--cc-text-tertiary)" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full flex items-center gap-2 rounded-full border px-4 py-2.5 text-left text-sm hover:border-[var(--cc-border-strong)] transition-colors"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
        color: "var(--cc-text-tertiary)",
      }}
    >
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="min-w-0 flex-1 truncate">
        <span style={{ color: "var(--cc-text)" }}>{query || "Search"}</span>
        {location?.display && <> · {location.display}</>}
      </span>
      <span
        className="shrink-0 font-medium"
        style={{ color: "var(--cc-primary)" }}
      >
        Change
      </span>
    </button>
  );
}
