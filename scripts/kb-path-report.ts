/**
 * KB review report (read-only). Issues #125, #126, #127.
 *
 * Default mode — resolution paths for a human to judge:
 *   - Nodes auto-flagged for re-evaluation (kb_flag_resolution_nodes)
 *   - Resolution paths with bounce rate above --threshold (default 0.30) and
 *     at least --min-walks walks (default 10) over the last --months months
 *   - Median bounce rate across resolution nodes (Stage 2 target: < 20%)
 *
 * --emerging — queries the KB keeps missing (#127):
 *   - First-turn KB misses ('miss' events) in the last --days days, by
 *     distinct sessions (at least --min-misses, default 2)
 *   - Canonical queries gaining the most new phrasings in that window
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/kb-path-report.ts
 *   npx tsx --env-file=.env.local scripts/kb-path-report.ts --min-walks 50 --threshold 0.25 --months 6
 *   npx tsx --env-file=.env.local scripts/kb-path-report.ts --emerging --days 14
 *
 * Stats come from kb_path_stats, which the daily pg_cron roll-up refreshes;
 * run `select kb_rollup_path_stats();` in the SQL editor for up-to-the-minute
 * numbers. Rates are distinct sessions per walking session (capped at 1).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  countNewPhrasings,
  highBouncePaths,
  summarizeMisses,
  summarizePaths,
  type MissEvent,
  type PathStatsRow,
} from "@/lib/kb/path-report";

const PAGE = 1000;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isFinite(value)) {
    console.error(`--${name} needs a number`);
    process.exit(1);
  }
  return value;
}

const pct = (v: number | null) =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;

/** Page through a query; `build` must return a fresh query each call. */
async function fetchAll<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

interface NodeRow {
  path_hash: string;
  canonical_query: string;
  answer_path: string[];
  version: number;
  payload: { codes?: { code: string; description?: string }[] } | null;
  flagged_at: string | null;
  flag_reason: string | null;
}

function describeNode(node: NodeRow | undefined, hash: string): string[] {
  if (!node) return [`  (node ${hash.slice(0, 12)}… no longer in kb_nodes)`];
  const codes = (node.payload?.codes ?? [])
    .map((c) => (c.description ? `${c.code} ${c.description}` : c.code))
    .join("; ");
  return [
    `  query:  "${node.canonical_query}"`,
    `  path:   ${node.answer_path.length ? node.answer_path.join(" → ") : "(root)"}`,
    `  codes:  ${codes || "(none)"}`,
    `  hash:   ${node.path_hash}  v${node.version}`,
  ];
}

async function fetchNodes(
  supabase: SupabaseClient,
  hashes: string[]
): Promise<Map<string, NodeRow>> {
  const nodes = new Map<string, NodeRow>();
  for (let i = 0; i < hashes.length; i += 200) {
    const { data, error } = await supabase
      .from("kb_nodes")
      .select(
        "path_hash, canonical_query, answer_path, version, payload, flagged_at, flag_reason"
      )
      .in("path_hash", hashes.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as NodeRow[]) nodes.set(row.path_hash, row);
  }
  return nodes;
}

async function pathReport(supabase: SupabaseClient) {
  const minWalks = numberArg("min-walks", 10);
  const threshold = numberArg("threshold", 0.3);
  const months = numberArg("months", 3);

  // Flagged nodes (no admin notifications exist; this list is the queue).
  const { data: flagged, error: flaggedError } = await supabase
    .from("kb_nodes")
    .select(
      "path_hash, canonical_query, answer_path, version, payload, flagged_at, flag_reason"
    )
    .not("flagged_at", "is", null)
    .order("flagged_at", { ascending: false });
  if (flaggedError) throw new Error(flaggedError.message);

  console.log(`\n=== Flagged for re-evaluation: ${flagged?.length ?? 0} ===`);
  console.log(
    "(served as KB misses; the next Claude answer on the path replaces them,\n" +
      " archiving the old version in kb_node_history)"
  );
  for (const node of (flagged ?? []) as NodeRow[]) {
    console.log(`\n- flagged ${node.flagged_at}: ${node.flag_reason ?? ""}`);
    for (const line of describeNode(node, node.path_hash)) console.log(line);
  }

  const since = new Date();
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - (months - 1));
  const sinceDate = since.toISOString().slice(0, 10);

  const rows = await fetchAll<PathStatsRow>((from, to) =>
    supabase
      .from("kb_resolution_confidence")
      .select(
        "path_hash, period, walk_count, click_count, save_count, bounce_count, confidence"
      )
      .gte("period", sinceDate)
      .order("period")
      .range(from, to)
  );

  const summaries = summarizePaths(rows);
  const { paths, medianBounceRate, eligible } = highBouncePaths(summaries, {
    minWalks,
    threshold,
  });

  console.log(
    `\n=== Resolution paths since ${sinceDate} (${summaries.length} with stats) ===`
  );
  console.log(
    `Median bounce rate across ${eligible} paths with ≥${minWalks} walks: ${pct(medianBounceRate)} (target < 20%)`
  );
  console.log(
    `\n=== Bounce rate > ${pct(threshold)} with ≥${minWalks} walks: ${paths.length} ===`
  );
  if (paths.length === 0) return;

  const nodes = await fetchNodes(
    supabase,
    paths.map((p) => p.path_hash)
  );
  for (const p of paths) {
    console.log(
      `\n- bounce ${pct(p.bounce_rate)}  click ${pct(p.click_rate)}  ` +
        `walks ${p.walks} over ${p.months} mo  saves ${p.saves}  ` +
        `confidence ${p.latest_confidence ?? "—"} (${p.latest_period})` +
        (nodes.get(p.path_hash)?.flagged_at ? "  [FLAGGED]" : "")
    );
    for (const line of describeNode(nodes.get(p.path_hash), p.path_hash)) {
      console.log(line);
    }
  }
}

async function emergingReport(supabase: SupabaseClient) {
  const days = numberArg("days", 14);
  const minMisses = numberArg("min-misses", 2);
  const limit = numberArg("limit", 25);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const misses = await fetchAll<MissEvent>((from, to) =>
    supabase
      .from("kb_events")
      .select("path_hash, session_id, created_at")
      .eq("event_type", "miss")
      .gte("created_at", since)
      .order("created_at")
      .range(from, to)
  );
  const top = summarizeMisses(misses, minMisses).slice(0, limit);

  const synonymsByHash = new Map<
    string,
    { normalized_query: string; canonical_query: string }
  >();
  for (let i = 0; i < top.length; i += 200) {
    const { data, error } = await supabase
      .from("kb_synonyms")
      .select("query_hash, normalized_query, canonical_query")
      .in(
        "query_hash",
        top.slice(i, i + 200).map((m) => m.query_hash)
      );
    if (error) throw new Error(error.message);
    for (const s of data ?? []) synonymsByHash.set(s.query_hash, s);
  }

  // Which canonicals already have a cached first question?
  const canonicals = [
    ...new Set([...synonymsByHash.values()].map((s) => s.canonical_query)),
  ];
  const rooted = new Set<string>();
  for (let i = 0; i < canonicals.length; i += 200) {
    const { data, error } = await supabase
      .from("kb_nodes")
      .select("canonical_query")
      .eq("depth", 0)
      .eq("node_type", "question")
      .in("canonical_query", canonicals.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const n of data ?? []) rooted.add(n.canonical_query);
  }

  console.log(
    `\n=== Repeated first-turn KB misses, last ${days} days (≥${minMisses} sessions): ${top.length} ===`
  );
  console.log(
    "(each one cost a Claude call; a canonical with no cached root question is a seeding candidate)"
  );
  for (const m of top) {
    const syn = synonymsByHash.get(m.query_hash);
    const label = syn
      ? `"${syn.normalized_query}" → canonical "${syn.canonical_query}"` +
        (rooted.has(syn.canonical_query) ? "" : "  [no cached root question]")
      : `(query ${m.query_hash.slice(0, 12)}… not in kb_synonyms — write-back failed?)`;
    console.log(
      `- ${String(m.sessions).padStart(4)} sessions  last ${m.last_seen.slice(0, 10)}  ${label}`
    );
  }

  const synonyms = await fetchAll<{ canonical_query: string }>((from, to) =>
    supabase
      .from("kb_synonyms")
      .select("canonical_query")
      .gte("created_at", since)
      .order("created_at")
      .range(from, to)
  );
  const growth = countNewPhrasings(synonyms).slice(0, limit);
  console.log(
    `\n=== Canonical queries gaining new phrasings, last ${days} days: ${growth.length} ===`
  );
  for (const g of growth) {
    console.log(`- ${String(g.phrasings).padStart(4)}  "${g.canonical_query}"`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (flag("emerging")) await emergingReport(supabase);
  else await pathReport(supabase);
}

main().catch((err) => {
  console.error("KB report failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
