import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let initialized = false;

/** Call once before any `importLibrary()`. Safe to call multiple times. */
export function ensureGoogleMaps(apiKey: string) {
  if (initialized) return;
  setOptions({ key: apiKey, v: "weekly" });
  initialized = true;
}

export { importLibrary };
