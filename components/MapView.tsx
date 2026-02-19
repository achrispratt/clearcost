"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { ChargeResult } from "@/types";

interface MapViewProps {
  results: ChargeResult[];
  center?: { lat: number; lng: number };
  onMarkerClick?: (result: ChargeResult) => void;
}

let optionsSet = false;

export function MapView({ results, center, onMarkerClick }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("Google Maps API key not configured");
      return;
    }

    if (!optionsSet) {
      setOptions({ key: apiKey, v: "weekly" });
      optionsSet = true;
    }

    importLibrary("maps")
      .then(({ Map }) => {
        if (!mapRef.current) return;

        const mapInstance = new Map(mapRef.current, {
          center: center || { lat: 40.7128, lng: -74.006 },
          zoom: 11,
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        });

        setMap(mapInstance);
      })
      .catch(() => {
        setError("Failed to load Google Maps");
      });
  }, [center]);

  useEffect(() => {
    if (!map || results.length === 0) return;

    const markers: google.maps.Marker[] = [];
    const bounds = new google.maps.LatLngBounds();

    results.forEach((result, i) => {
      // Skip results without valid coordinates
      if (result.provider.lat == null || result.provider.lng == null) return;

      const position = { lat: result.provider.lat, lng: result.provider.lng };

      const marker = new google.maps.Marker({
        position,
        map,
        label: {
          text: `${i + 1}`,
          color: "white",
          fontSize: "12px",
          fontWeight: "bold",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#2563EB",
          fillOpacity: 1,
          strokeColor: "#1D4ED8",
          strokeWeight: 2,
        },
      });

      const addressDisplay = result.provider.address || result.provider.city || "";
      const priceDisplay = result.cashPrice ? `$${result.cashPrice.toLocaleString()}` : "";
      const distanceDisplay = result.distanceMiles ? `${result.distanceMiles.toFixed(1)} mi` : "";

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; max-width: 220px;">
            <p style="font-weight: 600; margin: 0;">${result.provider.name}</p>
            ${addressDisplay ? `<p style="color: #6B7280; font-size: 12px; margin: 4px 0;">${addressDisplay}</p>` : ""}
            ${priceDisplay ? `<p style="font-size: 18px; font-weight: 700; color: #2563EB; margin: 4px 0;">${priceDisplay}</p>` : ""}
            ${distanceDisplay ? `<p style="color: #9CA3AF; font-size: 11px; margin: 2px 0;">${distanceDisplay} away</p>` : ""}
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindow.open(map, marker);
        onMarkerClick?.(result);
      });

      markers.push(marker);
      bounds.extend(position);
    });

    if (results.length > 1) {
      map.fitBounds(bounds, 50);
    }

    return () => {
      markers.forEach((m) => m.setMap(null));
    };
  }, [map, results, onMarkerClick]);

  if (error) {
    return (
      <div className="bg-gray-100 rounded-lg flex items-center justify-center h-96">
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="w-full h-96 rounded-lg border border-gray-200"
    />
  );
}
