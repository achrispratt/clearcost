import data from "./page-index.json";

/** Stats for one published procedure + city page, from the last index build. */
export interface SeoPageStats {
  procedure: string;
  metro: string;
  /** Hospitals (shared price lists counted once) with a usable price. */
  hospitals: number;
  low: number;
  median: number;
  high: number;
}

export interface SeoPageIndex {
  /** Date the index was built (YYYY-MM-DD). */
  generatedAt: string;
  radiusMiles: number;
  /** Typical national price per procedure slug, used to drop outliers. */
  nationalMedians: Record<string, number>;
  pages: SeoPageStats[];
}

export const SEO_PAGE_INDEX: SeoPageIndex = data;

export function findPage(
  procedure: string,
  metro: string
): SeoPageStats | undefined {
  return SEO_PAGE_INDEX.pages.find(
    (p) => p.procedure === procedure && p.metro === metro
  );
}

export function pagesForProcedure(procedure: string): SeoPageStats[] {
  return SEO_PAGE_INDEX.pages.filter((p) => p.procedure === procedure);
}

export function pagesForMetro(metro: string): SeoPageStats[] {
  return SEO_PAGE_INDEX.pages.filter((p) => p.metro === metro);
}
