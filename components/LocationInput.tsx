"use client";

import { useState, useCallback, useRef, useEffect, useId } from "react";
import type { LocationSuggestion } from "@/lib/location-suggest";
import { SuggestionList, handleSuggestionKey } from "./SuggestionList";

interface LocationInputProps {
  onLocationSelect: (location: {
    lat: number;
    lng: number;
    display: string;
  }) => void;
  onGeocodingChange?: (geocoding: boolean) => void;
  onTextChange?: (text: string) => void;
  onLocationInvalidate?: () => void;
  compact?: boolean;
  initialValue?: string;
}

export function LocationInput({
  onLocationSelect,
  onGeocodingChange,
  onTextChange,
  onLocationInvalidate,
  compact,
  initialValue = "",
}: LocationInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const geocodeSeq = useRef(0); // newer selections win over slow geocodes

  // Notify parent of geocoding state changes
  useEffect(() => {
    onGeocodingChange?.(geocoding || detectingLocation);
  }, [geocoding, detectingLocation, onGeocodingChange]);

  const geocodeAddress = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      const seq = ++geocodeSeq.current;
      setGeocoding(true);
      try {
        const response = await fetch(
          `/api/geocode?address=${encodeURIComponent(input)}`
        );
        const data = await response.json();

        if (seq === geocodeSeq.current && data.lat && data.lng) {
          onLocationSelect({
            lat: data.lat,
            lng: data.lng,
            display: data.formatted || input,
          });
        }
      } catch (error) {
        console.error("Geocoding error:", error);
      } finally {
        setGeocoding(false);
      }
    },
    [onLocationSelect]
  );

  const handleInputChange = useCallback(
    (input: string) => {
      onTextChange?.(input);
      onLocationInvalidate?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = input.trim();
      if (suggestRef.current) clearTimeout(suggestRef.current);
      suggestRef.current = setTimeout(async () => {
        if (trimmed.length < 2) {
          setSuggestions([]);
          return;
        }
        try {
          const res = await fetch(
            `/api/locations?q=${encodeURIComponent(trimmed)}`
          );
          const data = await res.json();
          setSuggestions(data.suggestions ?? []);
          setActiveIndex(-1);
        } catch {
          setSuggestions([]);
        }
      }, 120);

      if (trimmed.length >= 3) {
        debounceRef.current = setTimeout(() => {
          geocodeAddress(trimmed);
        }, 300);
      }
    },
    [geocodeAddress, onTextChange, onLocationInvalidate]
  );

  const handleImmediate = useCallback(
    (input: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      geocodeAddress(input);
    },
    [geocodeAddress]
  );

  const selectSuggestion = useCallback(
    (suggestion: LocationSuggestion) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestRef.current) clearTimeout(suggestRef.current);
      geocodeSeq.current++;
      if (inputRef.current) inputRef.current.value = suggestion.label;
      setSuggestions([]);
      setActiveIndex(-1);
      onTextChange?.(suggestion.label);
      onLocationSelect({
        lat: suggestion.lat,
        lng: suggestion.lng,
        display: suggestion.label,
      });
    },
    [onLocationSelect, onTextChange]
  );

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestRef.current) clearTimeout(suggestRef.current);
    };
  }, []);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onLocationSelect({
          lat: latitude,
          lng: longitude,
          display: "Current Location",
        });
        if (inputRef.current) inputRef.current.value = "Current Location";
        onTextChange?.("Current Location");
        setDetectingLocation(false);
      },
      () => {
        setDetectingLocation(false);
      }
    );
  }, [onLocationSelect, onTextChange]);

  const isLoading = geocoding || detectingLocation;

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Location"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        defaultValue={initialValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={() => {
          setSuggestions([]);
          if (inputRef.current) handleImmediate(inputRef.current.value);
        }}
        onKeyDown={(e) => {
          const handled = handleSuggestionKey(
            e,
            suggestions.length,
            activeIndex,
            setActiveIndex,
            (i) => selectSuggestion(suggestions[i]),
            () => setSuggestions([])
          );
          if (!handled && e.key === "Enter" && inputRef.current) {
            setSuggestions([]);
            handleImmediate(inputRef.current.value);
          }
        }}
        placeholder="ZIP or city"
        className={`w-full bg-transparent focus:outline-none placeholder:text-[var(--cc-text-tertiary)] ${
          compact ? "py-2.5 text-sm" : "py-4 sm:py-3.5 text-sm"
        }`}
        style={{ color: "var(--cc-text)" }}
      />
      <button
        type="button"
        onClick={detectLocation}
        disabled={isLoading}
        className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md transition-colors hover:bg-[var(--cc-surface-alt)]"
        title="Use my location"
        style={{ color: "var(--cc-text-tertiary)" }}
      >
        {isLoading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
        ) : (
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        )}
      </button>
      <SuggestionList
        id={listId}
        label="Location suggestions"
        items={suggestions.map((s) => s.label)}
        activeIndex={activeIndex}
        onSelect={(i) => selectSuggestion(suggestions[i])}
        onHover={setActiveIndex}
      />
    </div>
  );
}
