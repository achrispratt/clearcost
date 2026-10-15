// @ts-expect-error zipcodes has no bundled TypeScript declarations.
import zipcodes from "zipcodes";

export interface LocationSuggestion {
  label: string;
  lat: number;
  lng: number;
}

interface ZipRecord {
  zip: string;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
}

interface CityEntry extends LocationSuggestion {
  key: string; // "houston" — lowercase city name
  state: string;
  zipCount: number; // proxy for size, used to rank big cities first
}

const MAX_SUGGESTIONS = 6;

let cities: CityEntry[] | null = null;
let zips: ZipRecord[] | null = null;

function load() {
  if (cities && zips) return { cities, zips };
  const all = Object.values(zipcodes.codes as Record<string, ZipRecord>).filter(
    (z) => z.country === "US" && z.latitude != null && z.longitude != null
  );
  const byCity = new Map<string, CityEntry>();
  for (const z of all) {
    const id = `${z.city.toLowerCase()}|${z.state}`;
    const existing = byCity.get(id);
    if (existing) {
      existing.zipCount++;
    } else {
      byCity.set(id, {
        label: `${z.city}, ${z.state}`,
        lat: z.latitude,
        lng: z.longitude,
        key: z.city.toLowerCase(),
        state: z.state,
        zipCount: 1,
      });
    }
  }
  cities = [...byCity.values()].sort((a, b) => b.zipCount - a.zipCount);
  zips = all.sort((a, b) => a.zip.localeCompare(b.zip));
  return { cities, zips };
}

/** US city and ZIP suggestions for a partly typed location, from local data. */
export function suggestLocations(input: string): LocationSuggestion[] {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  const { cities, zips } = load();

  if (/^\d{3,5}$/.test(q)) {
    return zips
      .filter((z) => z.zip.startsWith(q))
      .slice(0, MAX_SUGGESTIONS)
      .map((z) => ({
        label: `${z.city}, ${z.state} ${z.zip}`,
        lat: z.latitude,
        lng: z.longitude,
      }));
  }

  const [cityPart, statePart = ""] = q.split(",").map((s) => s.trim());
  if (!cityPart) return [];
  const state = statePart.toUpperCase();
  return cities
    .filter(
      (c) => c.key.startsWith(cityPart) && (!state || c.state.startsWith(state))
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ label, lat, lng }) => ({ label, lat, lng }));
}
