import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 }
    );
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

    return NextResponse.json(
      { error: "Location not found" },
      { status: 404 }
    );
  } catch {
    return NextResponse.json(
      { error: "Geocoding failed" },
      { status: 500 }
    );
  }
}

/** Basic ZIP/city fallback for NYC metro area when no Google Maps API key is configured. */
function handleFallbackGeocode(address: string) {
  const nycZips: Record<string, { lat: number; lng: number; name: string }> = {
    "10001": { lat: 40.7484, lng: -73.9967, name: "New York, NY 10001" },
    "10002": { lat: 40.7157, lng: -73.9863, name: "New York, NY 10002" },
    "10003": { lat: 40.7317, lng: -73.9893, name: "New York, NY 10003" },
    "10010": { lat: 40.739, lng: -73.9826, name: "New York, NY 10010" },
    "10016": { lat: 40.7459, lng: -73.9781, name: "New York, NY 10016" },
    "10019": { lat: 40.7654, lng: -73.9854, name: "New York, NY 10019" },
    "10021": { lat: 40.7693, lng: -73.9588, name: "New York, NY 10021" },
    "10028": { lat: 40.7763, lng: -73.9534, name: "New York, NY 10028" },
    "10032": { lat: 40.8384, lng: -73.9427, name: "New York, NY 10032" },
    "10037": { lat: 40.8138, lng: -73.937, name: "New York, NY 10037" },
    "11201": { lat: 40.6934, lng: -73.9896, name: "Brooklyn, NY 11201" },
    "11215": { lat: 40.6711, lng: -73.9863, name: "Brooklyn, NY 11215" },
    "10301": { lat: 40.6433, lng: -74.077, name: "Staten Island, NY 10301" },
    "10451": { lat: 40.8204, lng: -73.9234, name: "Bronx, NY 10451" },
    "11101": { lat: 40.7503, lng: -73.9407, name: "Long Island City, NY 11101" },
  };

  const zip = address.trim().replace(/\D/g, "").slice(0, 5);
  if (nycZips[zip]) {
    return NextResponse.json({
      lat: nycZips[zip].lat,
      lng: nycZips[zip].lng,
      formatted: nycZips[zip].name,
    });
  }

  const lower = address.toLowerCase();
  if (
    lower.includes("new york") ||
    lower.includes("nyc") ||
    lower.includes("manhattan")
  ) {
    return NextResponse.json({
      lat: 40.7128,
      lng: -74.006,
      formatted: "New York, NY",
    });
  }

  if (lower.includes("brooklyn")) {
    return NextResponse.json({
      lat: 40.6782,
      lng: -73.9442,
      formatted: "Brooklyn, NY",
    });
  }

  if (lower.includes("bronx")) {
    return NextResponse.json({
      lat: 40.8448,
      lng: -73.8648,
      formatted: "Bronx, NY",
    });
  }

  if (lower.includes("queens")) {
    return NextResponse.json({
      lat: 40.7282,
      lng: -73.7949,
      formatted: "Queens, NY",
    });
  }

  return NextResponse.json(
    {
      error:
        "Location not found. Try a NYC ZIP code or borough name for the MVP.",
    },
    { status: 404 }
  );
}
