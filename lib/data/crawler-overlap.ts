import type { Pool as PgPool } from "pg";

/**
 * Oria rows a crawled price file already covers.
 *
 * When the crawler loads a hospital (scripts/crawl-mrf.ts --load),
 * apply_mrf_load() moves that hospital's Oria rows for the same codes into
 * charges_archive, so search never shows two prices for one code
 * (migration 20261018120000_mrf_load_swap.sql). A later Oria import must not
 * put them back: the extra rows also crowd other hospitals out of
 * search_charges_nearby's row limit. Codes compare the way apply_mrf_load
 * compares them: CPT and HCPCS by value under either label, MS-DRGs without
 * leading zeros.
 */

/** A charges-shaped row; only provider_id, cpt, hcpcs and ms_drg are read. */
export type OverlapRow = Record<string, unknown>;

/** The DRG as given, bare ("5") and zero-padded ("005"). */
export function drgVariants(drg: string | null): string[] {
  if (!drg) return [];
  const bare = drg.replace(/^0+(?=\d)/, "");
  return Array.from(new Set([drg, bare, bare.padStart(3, "0")]));
}

/**
 * One query per batch, each EXISTS shaped to use a (code, provider) index.
 * Returns the 1-based positions of rows whose hospital has a crawled
 * (source 'cms_mrf') row for the same code.
 */
export const CRAWLED_ROWS_SQL = `
  SELECT v.i
  FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
    WITH ORDINALITY AS v(provider_id, cpt, hcpcs, drgs, i)
  WHERE (v.cpt IS NOT NULL AND (
          EXISTS (SELECT 1 FROM charges m WHERE m.cpt = v.cpt
                    AND m.provider_id = v.provider_id AND m.source = 'cms_mrf')
       OR EXISTS (SELECT 1 FROM charges m WHERE m.hcpcs = v.cpt
                    AND m.provider_id = v.provider_id AND m.source = 'cms_mrf')))
     OR (v.hcpcs IS NOT NULL AND (
          EXISTS (SELECT 1 FROM charges m WHERE m.hcpcs = v.hcpcs
                    AND m.provider_id = v.provider_id AND m.source = 'cms_mrf')
       OR EXISTS (SELECT 1 FROM charges m WHERE m.cpt = v.hcpcs
                    AND m.provider_id = v.provider_id AND m.source = 'cms_mrf')))
     OR (v.drgs IS NOT NULL AND
          EXISTS (SELECT 1 FROM charges m
                  WHERE m.provider_id = v.provider_id
                    AND m.ms_drg = ANY(string_to_array(v.drgs, ','))
                    AND m.source = 'cms_mrf'))`;

export function overlapParams(rows: OverlapRow[]): unknown[][] {
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  return [
    rows.map((r) => r.provider_id),
    rows.map((r) => str(r.cpt)),
    rows.map((r) => str(r.hcpcs)),
    rows.map((r) => drgVariants(str(r.ms_drg)).join(",") || null),
  ];
}

/** Splits a batch into rows to load and the count the crawler already covers. */
export function dropCrawled<T>(
  rows: T[],
  crawledPositions: Iterable<number>
): { keep: T[]; crawled: number } {
  const drop = new Set(crawledPositions);
  const keep = rows.filter((_, idx) => !drop.has(idx + 1));
  return { keep, crawled: rows.length - keep.length };
}

export async function withoutCrawledRows<T extends OverlapRow>(
  pool: PgPool,
  rows: T[]
): Promise<{ keep: T[]; crawled: number }> {
  if (rows.length === 0) return { keep: rows, crawled: 0 };
  const res = await pool.query<{ i: string }>(
    CRAWLED_ROWS_SQL,
    overlapParams(rows)
  );
  return dropCrawled(
    rows,
    res.rows.map((r) => Number(r.i))
  );
}
