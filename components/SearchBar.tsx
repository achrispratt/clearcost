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
  compact,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    display: string;
  } | null>(null);
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

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="w-full">
        <div
          className="search-container flex flex-col sm:flex-row items-stretch rounded-xl border bg-[var(--cc-surface)] overflow-hidden"
          style={{ borderColor: "var(--cc-border)" }}
        >
          <div className="flex items-center flex-1 px-3 gap-2">
            <svg
              className="w-4 h-4 shrink-0"
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
              className="w-full py-2.5 bg-transparent text-sm focus:outline-none placeholder:text-[var(--cc-text-tertiary)]"
              style={{ color: "var(--cc-text)" }}
            />
          </div>

          <div
            className="hidden sm:block w-px my-2"
            style={{ background: "var(--cc-border)" }}
          />
          <div
            className="sm:hidden h-px mx-3"
            style={{ background: "var(--cc-border)" }}
          />

          <div className="flex items-center px-3 sm:w-44">
            <svg
              className="w-3.5 h-3.5 shrink-0 mr-1.5"
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
              compact
            />
          </div>

          <button
            type="submit"
            disabled={isDisabled}
            className="m-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{
              background: isDisabled
                ? "var(--cc-text-tertiary)"
                : "var(--cc-primary)",
            }}
          >
            {getButtonContent("compact")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div
        className="search-container flex flex-col sm:flex-row items-stretch rounded-2xl border bg-[var(--cc-surface)] shadow-sm overflow-hidden"
        style={{ borderColor: "var(--cc-border)" }}
      >
        {/* Query input */}
        <div className="flex items-center flex-1 px-4 gap-3">
          <svg
            className="w-5 h-5 shrink-0"
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
            className="w-full py-4 sm:py-3.5 bg-transparent text-base focus:outline-none placeholder:text-[var(--cc-text-tertiary)]"
            style={{ color: "var(--cc-text)" }}
          />
        </div>

        {/* Dividers */}
        <div
          className="hidden sm:block w-px my-3"
          style={{ background: "var(--cc-border)" }}
        />
        <div
          className="sm:hidden h-px mx-4"
          style={{ background: "var(--cc-border)" }}
        />

        {/* Location input */}
        <div className="flex items-center px-4 sm:w-52">
          <svg
            className="w-4 h-4 shrink-0 mr-2"
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
          />
        </div>

        {/* Search button */}
        <button
          type="submit"
          disabled={isDisabled}
          className="m-2 px-6 py-3 rounded-xl text-white font-medium transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:brightness-110"
          style={{
            background: isDisabled
              ? "var(--cc-text-tertiary)"
              : "var(--cc-primary)",
          }}
        >
          {getButtonContent("full")}
        </button>
      </div>
    </form>
  );
}
