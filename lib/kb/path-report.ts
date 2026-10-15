/**
 * Pure aggregation helpers for scripts/kb-path-report.ts (#125, #127).
 * Kept free of I/O so they can be unit tested.
 */

/** One kb_path_stats month for a resolution node (from kb_resolution_confidence). */
export interface PathStatsRow {
  path_hash: string;
  period: string;
  walk_count: number;
  click_count: number;
  save_count: number;
  bounce_count: number;
  confidence: number | string | null;
}

export interface PathSummary {
  path_hash: string;
  months: number;
  walks: number;
  clicks: number;
  saves: number;
  bounces: number;
  /** Per walking session, capped at 1 (see kb_resolution_confidence). */
  bounce_rate: number | null;
  click_rate: number | null;
  latest_period: string;
  latest_confidence: number | null;
}

const rate = (count: number, walks: number): number | null =>
  walks > 0 ? Math.min(1, count / walks) : null;

/** Sum monthly rows into one summary per path. */
export function summarizePaths(rows: PathStatsRow[]): PathSummary[] {
  const byPath = new Map<string, PathStatsRow[]>();
  for (const row of rows) {
    const list = byPath.get(row.path_hash) ?? [];
    list.push(row);
    byPath.set(row.path_hash, list);
  }

  const summaries: PathSummary[] = [];
  for (const [path_hash, list] of byPath) {
    list.sort((a, b) => a.period.localeCompare(b.period));
    const latest = list[list.length - 1];
    const walks = list.reduce((n, r) => n + r.walk_count, 0);
    const clicks = list.reduce((n, r) => n + r.click_count, 0);
    const saves = list.reduce((n, r) => n + r.save_count, 0);
    const bounces = list.reduce((n, r) => n + r.bounce_count, 0);
    summaries.push({
      path_hash,
      months: list.length,
      walks,
      clicks,
      saves,
      bounces,
      bounce_rate: rate(bounces, walks),
      click_rate: rate(clicks, walks),
      latest_period: latest.period,
      latest_confidence:
        latest.confidence === null ? null : Number(latest.confidence),
    });
  }
  return summaries;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Paths worth a human look: at least `minWalks` walks and a bounce rate
 * strictly above `threshold`, worst first. Also returns the median bounce
 * rate across every path that meets `minWalks` (the spec's Stage 2 metric;
 * target < 20%).
 */
export function highBouncePaths(
  summaries: PathSummary[],
  opts: { minWalks: number; threshold: number }
): { paths: PathSummary[]; medianBounceRate: number | null; eligible: number } {
  const eligible = summaries.filter(
    (s) => s.walks >= opts.minWalks && s.bounce_rate !== null
  );
  const paths = eligible
    .filter((s) => (s.bounce_rate as number) > opts.threshold)
    .sort(
      (a, b) =>
        (b.bounce_rate as number) - (a.bounce_rate as number) ||
        b.walks - a.walks
    );
  return {
    paths,
    medianBounceRate: median(eligible.map((s) => s.bounce_rate as number)),
    eligible: eligible.length,
  };
}

/** A kb_events 'miss' row: path_hash is the query hash of the user's query. */
export interface MissEvent {
  path_hash: string;
  session_id: string;
  created_at: string;
}

export interface MissSummary {
  query_hash: string;
  sessions: number;
  last_seen: string;
}

/** Count distinct sessions per missed query, most frequent first. */
export function summarizeMisses(
  events: MissEvent[],
  minSessions: number
): MissSummary[] {
  const byQuery = new Map<string, { sessions: Set<string>; last: string }>();
  for (const e of events) {
    const entry = byQuery.get(e.path_hash) ?? {
      sessions: new Set<string>(),
      last: e.created_at,
    };
    entry.sessions.add(e.session_id);
    if (e.created_at > entry.last) entry.last = e.created_at;
    byQuery.set(e.path_hash, entry);
  }
  return [...byQuery.entries()]
    .map(([query_hash, { sessions, last }]) => ({
      query_hash,
      sessions: sessions.size,
      last_seen: last,
    }))
    .filter((m) => m.sessions >= minSessions)
    .sort(
      (a, b) =>
        b.sessions - a.sessions || b.last_seen.localeCompare(a.last_seen)
    );
}

/** Count new phrasings (kb_synonyms rows) per canonical query, most first. */
export function countNewPhrasings(
  synonyms: { canonical_query: string }[]
): { canonical_query: string; phrasings: number }[] {
  const counts = new Map<string, number>();
  for (const s of synonyms) {
    counts.set(s.canonical_query, (counts.get(s.canonical_query) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([canonical_query, phrasings]) => ({ canonical_query, phrasings }))
    .sort(
      (a, b) =>
        b.phrasings - a.phrasings ||
        a.canonical_query.localeCompare(b.canonical_query)
    );
}
