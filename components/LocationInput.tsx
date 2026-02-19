"use client";

import { useState, useCallback } from "react";

interface LocationInputProps {
  onLocationSelect: (location: {
    lat: number;
    lng: number;
    display: string;
  }) => void;
}

export function LocationInput({ onLocationSelect }: LocationInputProps) {
  const [value, setValue] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);

  const handleZipOrCity = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

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
      }
    },
    [onLocationSelect]
  );

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
        setDetectingLocation(false);
      },
      () => {
        setDetectingLocation(false);
      }
    );
  }, [onLocationSelect]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => handleZipOrCity(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleZipOrCity(value);
          }
        }}
        placeholder="ZIP code or city"
        className="input input-bordered w-full bg-white text-gray-900 border-gray-300 focus:border-blue-500 focus:outline-none pr-10"
      />
      <button
        type="button"
        onClick={detectLocation}
        disabled={detectingLocation}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500"
        title="Use my location"
      >
        {detectingLocation ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
