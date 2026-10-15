import type { SeoMetro } from "./metros";
import { metroLabel } from "./metros";
import type { SeoProcedure } from "./procedures";

export const SITE_URL = "https://www.clearcost.live";

export function procedurePath(procedure: SeoProcedure): string {
  return `/prices/${procedure.slug}`;
}

export function cityPagePath(procedure: SeoProcedure, metro: SeoMetro): string {
  return `/prices/${procedure.slug}/${metro.slug}`;
}

export function metroPath(metro: SeoMetro): string {
  return `/prices/in/${metro.slug}`;
}

/**
 * Opens the full results page for this procedure and city with the code
 * already chosen, so the visitor skips guided search and sees every hospital,
 * the map and the all-in estimate.
 */
export function resultsHref(procedure: SeoProcedure, metro: SeoMetro): string {
  const params = new URLSearchParams({
    q: procedure.name,
    codes: procedure.code,
    codeType: procedure.codeType,
    codeDescs: JSON.stringify({ [procedure.code]: procedure.summary }),
    interp: procedure.summary,
    lat: String(metro.lat),
    lng: String(metro.lng),
    loc: metroLabel(metro),
  });
  if (procedure.bodySite) params.set("site", procedure.bodySite);
  return `/results?${params.toString()}`;
}
