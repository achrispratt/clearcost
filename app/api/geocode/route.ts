import { NextRequest, NextResponse } from "next/server";
// @ts-expect-error zipcodes has no bundled TypeScript declarations.
import zipcodes from "zipcodes";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return handleFallbackGeocode(address);
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return NextResponse.json({
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formatted: result.formatted_address,
      });
    }

    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}

function extractUsZip(value: string): string | null {
  const match = value.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

function parseCityState(value: string): { city: string; state: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const city = parts.slice(0, -1).join(", ");
  const state = parts[parts.length - 1];
  if (!city || !state) return null;

  return { city, state };
}

/** National ZIP/city fallback when no Google Maps API key is configured. */
function handleFallbackGeocode(address: string) {
  const zip = extractUsZip(address);
  if (zip) {
    const match = zipcodes.lookup(zip);
    if (match?.latitude != null && match?.longitude != null) {
      return NextResponse.json({
        lat: match.latitude,
        lng: match.longitude,
        formatted: `${match.city}, ${match.state} ${match.zip}`,
      });
    }
  }

  const cityState = parseCityState(address);
  if (cityState) {
    const matches = zipcodes.lookupByName(cityState.city, cityState.state);
    const primary = Array.isArray(matches) ? matches[0] : null;

    if (primary?.latitude != null && primary?.longitude != null) {
      const zipDisplay = primary.zip ? ` ${primary.zip}` : "";
      return NextResponse.json({
        lat: primary.latitude,
        lng: primary.longitude,
        formatted: `${primary.city}, ${primary.state}${zipDisplay}`,
      });
    }
  }

  return NextResponse.json(
    {
      error:
        "Location not found. Without Google Maps API, enter a US ZIP code or City, ST.",
    },
    { status: 404 }
  );
}
