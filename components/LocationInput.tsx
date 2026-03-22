"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ensureGoogleMaps, importLibrary } from "@/lib/google-maps";

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
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [autocompleteReady, setAutocompleteReady] = useState(false);
  const [focusedOnce, setFocusedOnce] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Stable refs for callbacks used in autocomplete listener
  const onLocationSelectRef = useRef(onLocationSelect);
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  // Notify parent of geocoding state changes
  useEffect(() => {
    onGeocodingChange?.(geocoding || detectingLocation);
  }, [geocoding, detectingLocation, onGeocodingChange]);

  // Initialize Google Places Autocomplete (lazy — waits for first focus)
  useEffect(() => {
    if (!apiKey || !inputRef.current || !focusedOnce) return;

    ensureGoogleMaps(apiKey);

    let cancelled = false;

    importLibrary("places")
      .then(() => {
        if (cancelled || !inputRef.current) return;

        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "us" },
          types: ["(regions)"],
          fields: ["geometry", "formatted_address"],
        });

        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (place?.geometry?.location) {
            const display =
              place.formatted_address || inputRef.current?.value || "";
            onLocationSelectRef.current({
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
              display,
            });
            onTextChangeRef.current?.(display);
          }
        });

        autocompleteRef.current = ac;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setAutocompleteReady(true);
      })
      .catch((err) => {
        console.warn("Google Places API unavailable, using fallback geocoding:", err);
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [apiKey, focusedOnce]);

  // Fallback geocoding — only used when Places Autocomplete is unavailable
  const geocodeAddress = useCallback(
    async (input: string) => {
      if (!input.trim() || autocompleteReady) return;

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
    [onLocationSelect, autocompleteReady]
  );

  // Handle user typing — invalidate old location, debounce fallback geocode
  const handleInputChange = useCallback(
    (input: string) => {
      onTextChange?.(input);
      onLocationInvalidate?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Only run fallback geocoding if autocomplete isn't available
      if (!autocompleteReady) {
        const trimmed = input.trim();
        if (trimmed.length >= 3) {
          debounceRef.current = setTimeout(() => {
            geocodeAddress(trimmed);
          }, 300);
        }
      }
    },
    [geocodeAddress, onTextChange, onLocationInvalidate, autocompleteReady]
  );

  // Immediate geocode on blur or Enter — fallback only
  const handleImmediate = useCallback(
    (input: string) => {
      if (autocompleteReady) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      geocodeAddress(input);
    },
    [geocodeAddress, autocompleteReady]
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
        defaultValue={initialValue}
        onFocus={() => { if (!focusedOnce) setFocusedOnce(true); }}
        onChange={(e) => handleInputChange(e.target.value)}
        onBlur={() => {
          if (inputRef.current) handleImmediate(inputRef.current.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !autocompleteReady && inputRef.current) {
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
    </div>
  );
}
