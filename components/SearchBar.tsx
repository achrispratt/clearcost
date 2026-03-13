"use client";

import { useState, useCallback, useRef } from "react";
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
  const [locationText, setLocationText] = useState(
    initialLocation?.display || ""
  );
  const [validationErrors, setValidationErrors] = useState<{
    query?: string;
    location?: string;
  }>({});
  const [pendingSearch, setPendingSearch] = useState(false);
  const pendingSearchRef = useRef(false);
  const queryRef = useRef(query);
  const queryInputRef = useRef<HTMLInputElement>(null);

  const [placeholder] = useState(
    () => placeholders[Math.floor(Math.random() * placeholders.length)]
  );

  const clearPending = useCallback(() => {
    pendingSearchRef.current = false;
    setPendingSearch(false);
  }, []);

  // Wrap onLocationSelect to check pending search (success path)
  const handleLocationSelect = useCallback(
    (loc: { lat: number; lng: number; display: string }) => {
      setLocation(loc);
      if (pendingSearchRef.current) {
        clearPending();
        onSearch(queryRef.current.trim(), loc);
      }
    },
    [onSearch, clearPending]
  );

  // Check pending search failure when geocoding finishes without a location
  const handleGeocodingChange = useCallback(
    (isGeocoding: boolean) => {
      setGeocoding(isGeocoding);
      if (!isGeocoding && pendingSearchRef.current) {
        clearPending();
        setValidationErrors((prev) => ({
          ...prev,
          location: "Couldn\u2019t find that location. Try a ZIP code.",
        }));
      }
    },
    [clearPending]
  );

  const handleLocationTextChange = useCallback((text: string) => {
    setLocationText(text);
    setValidationErrors((prev) =>
      prev.location ? { ...prev, location: undefined } : prev
    );
  }, []);

  const handleLocationInvalidate = useCallback(() => {
    setLocation(null);
    clearPending();
  }, [clearPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const errors: { query?: string; location?: string } = {};
    if (!query.trim()) errors.query = "Describe a procedure or service";
    if (!locationText.trim()) errors.location = "Enter a ZIP code or city";

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      if (errors.query) queryInputRef.current?.focus();
      return;
    }

    if (location) {
      onSearch(query.trim(), location);
    } else {
      pendingSearchRef.current = true;
      setPendingSearch(true);
    }
  };

  const isLocating =
    pendingSearch || (!location && geocoding && !!query.trim());
  const looksReady = !!query.trim() && !!location && !loading;

  // Button label logic
  const getButtonContent = (size: "compact" | "full") => {
    if (loading) {
      return (
        <svg
          className={`${size === "compact" ? "w-4 h-4" : "w-5 h-5"} animate-spin`}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    if (isLocating) {
      return (
        <span className="flex items-center gap-1.5">
          <svg
            className={`${size === "compact" ? "w-3.5 h-3.5" : "w-4 h-4"} animate-spin`}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              opacity="0.25"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Locating...
        </span>
      );
    }
    return "Search";
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={compact ? "w-full" : "w-full max-w-2xl mx-auto"}
    >
      <div
        className={`search-container flex flex-col sm:flex-row items-stretch border bg-[var(--cc-surface)] overflow-hidden ${
          compact ? "rounded-xl" : "rounded-2xl shadow-sm"
        }`}
        style={{ borderColor: "var(--cc-border)" }}
      >
        <div
          className={`flex items-center flex-1 ${compact ? "px-3 gap-2" : "px-4 gap-3"}`}
        >
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
            ref={queryInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              queryRef.current = val;
              setQuery(val);
              setValidationErrors((prev) =>
                prev.query ? { ...prev, query: undefined } : prev
              );
            }}
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

        <div
          className={`flex items-center ${compact ? "px-3 sm:w-44" : "px-4 sm:w-44"}`}
        >
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
            onLocationSelect={handleLocationSelect}
            onGeocodingChange={handleGeocodingChange}
            onTextChange={handleLocationTextChange}
            onLocationInvalidate={handleLocationInvalidate}
            initialValue={initialLocation?.display}
            compact={compact}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full sm:w-auto text-white font-medium transition-all cursor-pointer disabled:cursor-not-allowed ${
            compact
              ? "m-1.5 px-4 py-2 rounded-lg text-sm"
              : "m-2 px-6 py-3 rounded-xl hover:brightness-110"
          }`}
          style={{
            background: looksReady
              ? "var(--cc-primary)"
              : "var(--cc-text-tertiary)",
            opacity: looksReady ? 1 : 0.4,
          }}
        >
          {getButtonContent(compact ? "compact" : "full")}
        </button>
      </div>

      {(validationErrors.query || validationErrors.location) && (
        <div className="flex justify-between px-2 pt-1.5 gap-4">
          {validationErrors.query ? (
            <p
              className="text-xs animate-fade-in"
              style={{ color: "var(--cc-error)" }}
            >
              {validationErrors.query}
            </p>
          ) : (
            <span />
          )}
          {validationErrors.location && (
            <p
              className="text-xs sm:ml-auto animate-fade-in"
              style={{ color: "var(--cc-error)" }}
            >
              {validationErrors.location}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
