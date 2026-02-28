"use client";

import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import type { ChargeResult } from "@/types";

interface MapViewProps {
  results: ChargeResult[];
  center?: { lat: number; lng: number };
  onMarkerClick?: (result: ChargeResult) => void;
  selectedResultId?: string | null;
  className?: string;
}

let optionsSet = false;

function buildInfoWindowContent(result: ChargeResult): string {
  const address = result.provider.address || result.provider.city || "";
  const price = result.cashPrice ? `$${result.cashPrice.toLocaleString()}` : "";
  const distance = result.distanceMiles ? `${result.distanceMiles.toFixed(1)} mi` : "";

  return `
    <div style="padding: 10px; max-width: 240px; font-family: system-ui, sans-serif;">
      <p style="font-weight: 600; margin: 0; color: #1A1A2E; font-size: 14px;">${result.provider.name}</p>
      ${address ? `<p style="color: #5C5C6F; font-size: 12px; margin: 4px 0 0;">${address}</p>` : ""}
      ${price ? `<p style="font-size: 20px; font-weight: 700; color: #0F766E; margin: 8px 0 0;">${price}</p>` : ""}
      ${distance ? `<p style="color: #9B9BA8; font-size: 11px; margin: 4px 0 0;">${distance} away</p>` : ""}
    </div>
  `;
}

const MAP_STYLES = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [{ color: "#d4eaf7" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry.fill",
    stylers: [{ color: "#f5f3ef" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e8e5df" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

export function MapView({ results, center, onMarkerClick, selectedResultId, className }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const centerLat = center?.lat;
  const centerLng = center?.lng;

  useEffect(() => {
    if (!apiKey || map || !mapRef.current) return;

    if (!optionsSet) {
      setOptions({ key: apiKey, v: "weekly" });
      optionsSet = true;
    }

    let cancelled = false;

    importLibrary("maps")
      .then(({ Map }) => {
        if (!mapRef.current || cancelled) return;

        const mapInstance = new Map(mapRef.current, {
          center:
            centerLat != null && centerLng != null
              ? { lat: centerLat, lng: centerLng }
              : { lat: 40.7128, lng: -74.006 },
          zoom: 11,
          styles: MAP_STYLES,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        setMap(mapInstance);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load Google Maps");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, centerLat, centerLng, map]);

  useEffect(() => {
    if (!map || centerLat == null || centerLng == null) return;
    map.setCenter({ lat: centerLat, lng: centerLng });
  }, [map, centerLat, centerLng]);

  useEffect(() => {
    if (!map || results.length === 0) return;

    const markers: google.maps.Marker[] = [];
    const bounds = new google.maps.LatLngBounds();

    results.forEach((result, i) => {
      if (result.provider.lat == null || result.provider.lng == null) return;

      const position = { lat: result.provider.lat, lng: result.provider.lng };

      const isSelected = result.id === selectedResultId;
      const marker = new google.maps.Marker({
        position,
        map,
        label: {
          text: `${i + 1}`,
          color: "white",
          fontSize: isSelected ? "13px" : "11px",
          fontWeight: "600",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isSelected ? 18 : 14,
          fillColor: isSelected ? "#D97706" : "#0F766E",
          fillOpacity: 1,
          strokeColor: isSelected ? "#B45309" : "#115E59",
          strokeWeight: isSelected ? 3 : 2,
        },
        zIndex: isSelected ? 1000 : i,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: buildInfoWindowContent(result),
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
  }, [map, results, onMarkerClick, selectedResultId]);

  if (!apiKey) {
    return (
      <div
        className={`rounded-xl flex items-center justify-center ${className || "h-96"}`}
        style={{
          background: "var(--cc-surface-alt)",
          border: "1px solid var(--cc-border)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--cc-text-secondary)" }}>
          Google Maps API key not configured
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-xl flex items-center justify-center ${className || "h-96"}`}
        style={{
          background: "var(--cc-surface-alt)",
          border: "1px solid var(--cc-border)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--cc-text-secondary)" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className={`w-full rounded-xl overflow-hidden ${className || "h-96"}`}
      style={{ border: "1px solid var(--cc-border)" }}
    />
  );
}
