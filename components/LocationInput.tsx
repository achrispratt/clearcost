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

/** Reach into a PlaceAutocompleteElement to find its inner <input>. */
function findInnerInput(el: HTMLElement): HTMLInputElement | null {
  return (
    el.querySelector<HTMLInputElement>("input") ??
    el.shadowRoot?.querySelector<HTMLInputElement>("input") ??
    null
  );
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
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteElRef = useRef<HTMLElement | null>(null);
  const initialValueRef = useRef(initialValue);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [autocompleteReady, setAutocompleteReady] = useState(false);
  const [focusedOnce, setFocusedOnce] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Stable refs for callbacks used in autocomplete listener
  const onLocationSelectRef = useRef(onLocationSelect);
  const onTextChangeRef = useRef(onTextChange);
  const onLocationInvalidateRef = useRef(onLocationInvalidate);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);
  useEffect(() => {
    onLocationInvalidateRef.current = onLocationInvalidate;
  }, [onLocationInvalidate]);

  // Notify parent of geocoding state changes
  useEffect(() => {
    onGeocodingChange?.(geocoding || detectingLocation);
  }, [geocoding, detectingLocation, onGeocodingChange]);

  // Initialize Google Places Autocomplete (New API, lazy — waits for first focus)
  useEffect(() => {
    if (!apiKey || !containerRef.current || !focusedOnce) return;

    ensureGoogleMaps(apiKey);

    let cancelled = false;

    importLibrary("places")
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const ac = new google.maps.places.PlaceAutocompleteElement({
          componentRestrictions: { country: "us" },
          types: ["(regions)"],
        });

        // Style the element to match our design
        ac.style.cssText = `
          width: 100%;
          --gmpx-color-surface: transparent;
          --gmpx-color-on-surface: var(--cc-text);
          --gmpx-font-family-base: inherit;
          --gmpx-font-size-base: 0.875rem;
        `;
        // Find the internal input after it renders and style it
        requestAnimationFrame(() => {
          const innerInput = findInnerInput(ac);
          if (innerInput) {
            innerInput.style.cssText = `
              background: transparent !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              font: inherit !important;
              color: var(--cc-text) !important;
              width: 100% !important;
            `;
            innerInput.placeholder = "ZIP or city";
            if (initialValueRef.current) innerInput.value = initialValueRef.current;
          }
        });

        ac.addEventListener("gmp-placeselect", async (e) => {
          const place = (e as google.maps.places.PlaceAutocompletePlaceSelectEvent).place;
          if (place) {
            try {
              await place.fetchFields({ fields: ["location", "formattedAddress"] });
              if (place.location) {
                const display = place.formattedAddress || "";
                onLocationSelectRef.current({
                  lat: place.location.lat(),
                  lng: place.location.lng(),
                  display,
                });
                onTextChangeRef.current?.(display);
              }
            } catch (err) {
              console.warn("Failed to fetch place details:", err);
            }
          }
        });

        // Track input changes for invalidation
        ac.addEventListener("input", () => {
          onLocationInvalidateRef.current?.();
          onTextChangeRef.current?.(findInnerInput(ac)?.value || "");
        });

        // Hide fallback input, show autocomplete
        const fallbackInput = inputRef.current;
        if (fallbackInput) fallbackInput.style.display = "none";
        containerRef.current?.appendChild(ac);
        autocompleteElRef.current = ac;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setAutocompleteReady(true);
      })
      .catch((err) => {
        console.warn("Google Places API unavailable, using fallback geocoding:", err);
      });

    const fallbackInput = inputRef.current;
    return () => {
      cancelled = true;
      if (autocompleteElRef.current) {
        autocompleteElRef.current.remove();
        autocompleteElRef.current = null;
      }
      if (fallbackInput) fallbackInput.style.display = "";
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

  // Handle user typing (fallback input only)
  const handleInputChange = useCallback(
    (input: string) => {
      onTextChange?.(input);
      onLocationInvalidate?.();
      if (debounceRef.current) clearTimeout(debounceRef.current);

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
        // Set text in whichever input is active
        if (autocompleteElRef.current) {
          const innerInput = findInnerInput(autocompleteElRef.current);
          if (innerInput) innerInput.value = "Current Location";
        }
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
    <div className="relative flex items-center" ref={containerRef}>
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
