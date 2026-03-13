"use client";

import { useState, useCallback, useRef, useEffect } from "react";

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
  const [value, setValue] = useState(initialValue);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notify parent of geocoding state changes
  useEffect(() => {
    onGeocodingChange?.(geocoding || detectingLocation);
  }, [geocoding, detectingLocation, onGeocodingChange]);

  const geocodeAddress = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      setGeocoding(true);
      try {
        const response = await fetch(
          `/api/geocode?address=${encodeURIComponent(input)}`
        );
        const data = await response.json();

        if (data.lat && data.lng) {
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

  // Debounced geocoding — triggers 300ms after user stops typing
  const handleInputChange = useCallback(
    (input: string) => {
      setValue(input);
      onTextChange?.(input);
      onLocationInvalidate?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Only auto-geocode if input looks like a plausible location
      // (3+ chars for city names, or 5 digits for ZIP)
      const trimmed = input.trim();
      if (trimmed.length >= 3) {
        debounceRef.current = setTimeout(() => {
          geocodeAddress(trimmed);
        }, 300);
      }
    },
    [geocodeAddress, onTextChange, onLocationInvalidate]
  );

  // Immediate geocode on blur or Enter (no debounce)
  const handleImmediate = useCallback(
    (input: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      geocodeAddress(input);
    },
    [geocodeAddress]
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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
        setValue("Current Location");
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
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={() => handleImmediate(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleImmediate(value);
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
        className="shrink-0 p-1.5 rounded-md transition-colors hover:bg-[var(--cc-surface-alt)]"
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
    </div>
  );
}
