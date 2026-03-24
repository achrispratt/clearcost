"use client";

import { useEffect, useRef, useState } from "react";
import { ensureGoogleMaps, importLibrary } from "@/lib/google-maps";
import type { ChargeResult } from "@/types";
import {
  getDisplayPrice,
  formatDisplayPrice,
  displayName,
  type DisplayPrice,
} from "@/lib/format";
import { haversineMiles } from "@/lib/geo";

interface MapViewProps {
  results: ChargeResult[];
  center?: { lat: number; lng: number };
  onMarkerClick?: (providerId: string) => void;
  selectedProviderId?: string | null;
  className?: string;
}

interface ProviderGroup {
  providerId: string;
  lat: number;
  lng: number;
  results: ChargeResult[];
}

const notNull = (v: string | undefined): string | undefined =>
  v && v.toLowerCase() !== "null" ? v : undefined;

function buildInfoWindowContent(providerResults: ChargeResult[]): string {
  const first = providerResults[0];
  const address =
    notNull(first.provider.address) || notNull(first.provider.city) || "";
  const distance = first.distanceMiles
    ? `${first.distanceMiles.toFixed(1)} mi`
    : "";

  // Find the best display price across all results for this provider
  let bestPrice: DisplayPrice = {
    amount: undefined,
    label: "",
    type: "unavailable",
  };
  for (const result of providerResults) {
    const dp = getDisplayPrice(result);
    if (
      dp.amount != null &&
      (bestPrice.amount == null || dp.amount < bestPrice.amount)
    ) {
      bestPrice = dp;
    }
  }

  const priceStr =
    bestPrice.amount != null ? formatDisplayPrice(bestPrice) : "";
  const priceColor =
    bestPrice.type === "insured"
      ? "#1e40af"
      : bestPrice.type === "gross"
        ? "#D97706"
        : "#0F766E";

  const listingsLine =
    providerResults.length > 1
      ? `<p style="color: #5C5C6F; font-size: 11px; margin: 4px 0 0;">${providerResults.length} price listings</p>`
      : "";

  return `
    <div style="padding: 10px; max-width: 240px; font-family: system-ui, sans-serif;">
      <p style="font-weight: 600; margin: 0; color: #1A1A2E; font-size: 14px;">${displayName(first.provider.name)}</p>
      ${address ? `<p style="color: #5C5C6F; font-size: 12px; margin: 4px 0 0;">${address}</p>` : ""}
      ${priceStr ? `<p style="font-size: 20px; font-weight: 700; color: ${priceColor}; margin: 8px 0 0;">${priceStr}</p>` : ""}
      ${bestPrice.label ? `<p style="color: #5C5C6F; font-size: 11px; margin: 2px 0 0;">${bestPrice.label}</p>` : ""}
      ${distance ? `<p style="color: #9B9BA8; font-size: 11px; margin: 4px 0 0;">${distance} away</p>` : ""}
      ${listingsLine}
    </div>
  `;
}

const DEFAULT_ICON = {
  path: 0, // google.maps.SymbolPath.CIRCLE (value is 0)
  scale: 12,
  fillColor: "#0F766E",
  fillOpacity: 1,
  strokeColor: "#115E59",
  strokeWeight: 2,
};

const SELECTED_ICON = {
  path: 0,
  scale: 16,
  fillColor: "#D97706",
  fillOpacity: 1,
  strokeColor: "#B45309",
  strokeWeight: 3,
};

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

const FIT_MARKER_LIMIT = 24;
const FIT_RADIUS_MILES = 30;
const FIT_MIN_ZOOM = 10;
const FIT_MAX_ZOOM = 13;

/** Group results by provider.id, one entry per unique provider location. */
function groupByProvider(results: ChargeResult[]): ProviderGroup[] {
  const map = new Map<string, ProviderGroup>();
  for (const result of results) {
    const { lat, lng } = result.provider;
    if (lat == null || lng == null) continue;
    const existing = map.get(result.provider.id);
    if (existing) {
      existing.results.push(result);
    } else {
      map.set(result.provider.id, {
        providerId: result.provider.id,
        lat,
        lng,
        results: [result],
      });
    }
  }
  return Array.from(map.values());
}

export function MapView({
  results,
  center,
  onMarkerClick,
  selectedProviderId,
  className,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const centerLat = center?.lat;
  const centerLng = center?.lng;

  // Stable refs for markers and InfoWindows so the selection effect can access them
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowsRef = useRef<Map<string, google.maps.InfoWindow>>(new Map());
  const activeInfoWindowRef = useRef<string | null>(null);
  // Track which provider was clicked via marker to avoid redundant pan
  const markerClickedRef = useRef<string | null>(null);
  // Track previously selected provider for targeted reset in Effect 4
  const prevSelectedRef = useRef<string | null>(null);

  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // --- Effect 1: Initialize map ---
  useEffect(() => {
    if (!apiKey || map || !mapRef.current) return;

    ensureGoogleMaps(apiKey);

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

  // --- Effect 2: Recenter on center change ---
  useEffect(() => {
    if (!map || centerLat == null || centerLng == null) return;
    map.setCenter({ lat: centerLat, lng: centerLng });
  }, [map, centerLat, centerLng]);

  // --- Effect 3: Create markers (only when results change, NOT on selection) ---
  useEffect(() => {
    if (!map || results.length === 0) return;

    const providerGroups = groupByProvider(results);
    let fitListener: google.maps.MapsEventListener | null = null;

    providerGroups.forEach((group) => {
      const position = { lat: group.lat, lng: group.lng };

      const marker = new google.maps.Marker({
        position,
        map,
        icon: DEFAULT_ICON,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: buildInfoWindowContent(group.results),
      });

      // Hover: show InfoWindow preview (desktop only, no-op on touch)
      marker.addListener("mouseover", () => {
        if (activeInfoWindowRef.current !== group.providerId) {
          infoWindow.open(map, marker);
        }
      });

      marker.addListener("mouseout", () => {
        // Don't close if this marker is the selected/active one
        if (activeInfoWindowRef.current !== group.providerId) {
          infoWindow.close();
        }
      });

      // Click: select provider
      marker.addListener("click", () => {
        // Close any previously selected InfoWindow
        if (
          activeInfoWindowRef.current &&
          activeInfoWindowRef.current !== group.providerId
        ) {
          const prevIw = infoWindowsRef.current.get(
            activeInfoWindowRef.current
          );
          prevIw?.close();
        }

        infoWindow.open(map, marker);
        activeInfoWindowRef.current = group.providerId;
        markerClickedRef.current = group.providerId;
        onMarkerClickRef.current?.(group.providerId);
      });

      markersRef.current.set(group.providerId, marker);
      infoWindowsRef.current.set(group.providerId, infoWindow);
    });

    // Fit bounds to nearby markers
    if (providerGroups.length > 0) {
      const bounds = new google.maps.LatLngBounds();

      if (centerLat != null && centerLng != null) {
        bounds.extend({ lat: centerLat, lng: centerLng });
      }

      const fitCandidates =
        centerLat != null && centerLng != null
          ? providerGroups
              .map((g) => ({
                ...g,
                distanceMiles: haversineMiles(
                  centerLat,
                  centerLng,
                  g.lat,
                  g.lng
                ),
              }))
              .sort((a, b) => a.distanceMiles - b.distanceMiles)
          : providerGroups.map((g) => ({
              ...g,
              distanceMiles: Infinity,
            }));

      const localCandidates = fitCandidates.filter(
        (c) => c.distanceMiles <= FIT_RADIUS_MILES
      );
      const selectedCandidates =
        localCandidates.length > 0 ? localCandidates : fitCandidates;

      selectedCandidates
        .slice(0, FIT_MARKER_LIMIT)
        .forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 50);
        fitListener = google.maps.event.addListenerOnce(map, "idle", () => {
          const zoom = map.getZoom();
          if (zoom == null) return;
          if (zoom > FIT_MAX_ZOOM) {
            map.setZoom(FIT_MAX_ZOOM);
            return;
          }
          if (centerLat != null && centerLng != null && zoom < FIT_MIN_ZOOM) {
            map.setZoom(FIT_MIN_ZOOM);
          }
        });
      }
    }

    const currentMarkers = markersRef.current;
    const currentInfoWindows = infoWindowsRef.current;

    return () => {
      if (fitListener) fitListener.remove();
      currentMarkers.forEach((m) => m.setMap(null));
      currentMarkers.clear();
      currentInfoWindows.clear();
      activeInfoWindowRef.current = null;
    };
  }, [map, results, centerLat, centerLng]);

  // --- Effect 4: Selection styling + pan (runs when selectedProviderId changes) ---
  useEffect(() => {
    if (!map) return;

    // Reset only the previously selected marker (not all markers)
    if (
      prevSelectedRef.current &&
      prevSelectedRef.current !== selectedProviderId
    ) {
      const prev = markersRef.current.get(prevSelectedRef.current);
      if (prev) {
        prev.setIcon(DEFAULT_ICON);
        prev.setZIndex(undefined);
      }
      const prevIw = infoWindowsRef.current.get(prevSelectedRef.current);
      prevIw?.close();
      activeInfoWindowRef.current = null;
    }
    prevSelectedRef.current = selectedProviderId ?? null;

    if (!selectedProviderId) return;

    const marker = markersRef.current.get(selectedProviderId);
    const infoWindow = infoWindowsRef.current.get(selectedProviderId);
    if (!marker) return;

    // Highlight selected marker
    marker.setIcon(SELECTED_ICON);
    marker.setZIndex(1000);

    // Open InfoWindow
    if (infoWindow) {
      infoWindow.open(map, marker);
      activeInfoWindowRef.current = selectedProviderId;
    }

    // Pan to marker if selection came from a card click (not from marker click)
    if (markerClickedRef.current === selectedProviderId) {
      // Selection came from our own marker click — no need to pan
      markerClickedRef.current = null;
    } else {
      const pos = marker.getPosition();
      if (pos) map.panTo(pos);
    }
  }, [map, selectedProviderId]);

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
