"use client";

import { useState, useEffect, useCallback } from "react";
import { LocationInput } from "./LocationInput";

interface SearchBarProps {
  onSearch: (
    query: string,
    location: { lat: number; lng: number; display: string }
  ) => void;
  loading?: boolean;
  initialQuery?: string;
  initialLocation?: { lat: number; lng: number; display: string };
  compact?: boolean;
}

const placeholders = [
  "I need a knee MRI",
  "How much is a colonoscopy?",
  "Blood work for cholesterol",
  "Chest X-ray near me",
];

export function SearchBar({
  onSearch,
  loading,
  initialQuery = "",
  initialLocation,
  compact,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    display: string;
  } | null>(initialLocation || null);
  const [geocoding, setGeocoding] = useState(false);

  const [placeholder, setPlaceholder] = useState(placeholders[0]);

  useEffect(() => {
    setPlaceholder(placeholders[Math.floor(Math.random() * placeholders.length)]);
  }, []);

  const handleGeocodingChange = useCallback((isGeocoding: boolean) => {
    setGeocoding(isGeocoding);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && location) {
      onSearch(query.trim(), location);
    }
  };

  const isDisabled = !query.trim() || !location || loading;
  const isWaitingForLocation = !!(query.trim() && !location && geocoding);

  // Button label logic
  const getButtonContent = (size: "compact" | "full") => {
    if (loading) {
      return (
        <svg className={`${size === "compact" ? "w-4 h-4" : "w-5 h-5"} animate-spin`} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    }
    if (isWaitingForLocation) {
      return (
        <span className="flex items-center gap-1.5">
          <svg className={`${size === "compact" ? "w-3.5 h-3.5" : "w-4 h-4"} animate-spin`} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Locating...
        </span>
      );
    }
    return "Search";
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? "w-full" : "w-full max-w-2xl mx-auto"}>
      <div
        className={`search-container flex flex-col sm:flex-row items-stretch border bg-[var(--cc-surface)] overflow-hidden ${
          compact ? "rounded-xl" : "rounded-2xl shadow-sm"
        }`}
        style={{ borderColor: "var(--cc-border)" }}
      >
        <div className={`flex items-center flex-1 ${compact ? "px-3 gap-2" : "px-4 gap-3"}`}>
          <svg
            className={`${compact ? "w-4 h-4" : "w-5 h-5"} shrink-0`}
            style={{ color: "var(--cc-text-tertiary)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-transparent focus:outline-none placeholder:text-[var(--cc-text-tertiary)] ${
              compact ? "py-2.5 text-sm" : "py-4 sm:py-3.5 text-base"
            }`}
            style={{ color: "var(--cc-text)" }}
          />
        </div>

        <div
          className={`hidden sm:block w-px ${compact ? "my-2" : "my-3"}`}
          style={{ background: "var(--cc-border)" }}
        />
        <div
          className={`sm:hidden h-px ${compact ? "mx-3" : "mx-4"}`}
          style={{ background: "var(--cc-border)" }}
        />

        <div className={`flex items-center ${compact ? "px-3 sm:w-44" : "px-4 sm:w-52"}`}>
          <svg
            className={`${compact ? "w-3.5 h-3.5 mr-1.5" : "w-4 h-4 mr-2"} shrink-0`}
            style={{ color: "var(--cc-text-tertiary)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <LocationInput
            onLocationSelect={setLocation}
            onGeocodingChange={handleGeocodingChange}
            initialValue={initialLocation?.display}
            compact={compact}
          />
        </div>

        <button
          type="submit"
          disabled={isDisabled}
          className={`text-white font-medium transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed ${
            compact
              ? "m-1.5 px-4 py-2 rounded-lg text-sm"
              : "m-2 px-6 py-3 rounded-xl hover:brightness-110"
          }`}
          style={{
            background: isDisabled
              ? "var(--cc-text-tertiary)"
              : "var(--cc-primary)",
          }}
        >
          {getButtonContent(compact ? "compact" : "full")}
        </button>
      </div>
    </form>
  );
}
