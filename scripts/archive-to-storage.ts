/**
 * Moves charges_archive (rows a crawler load replaced, kept only to undo a
 * load) to Supabase Storage, so it stops taking database disk.
 *
 * Export (default): for each hospital with archived rows, writes
 * `<provider_id>.ndjson.gz` to the private `charges-archive` bucket, merged
 * with any earlier file for that hospital, then reads the file back and
 * checks every archived row is in it. The nightly purge_exported_archive()
 * job (05:15 UTC) then empties the table of hospitals whose file is newer
 * than their last archived row. Migration 20261029060000.
 *
 * Restore: `--restore <provider_id>` puts that hospital's rows from Storage
 * back into charges_archive; then `select restore_mrf_load('<id>')` undoes
 * the load as before.
 *
 *   npx tsx --env-file=.env.local scripts/archive-to-storage.ts
 *   options: --dry-run  --limit <n>  --concurrency <n>  --restore <provider_id>
 */

import { gunzipSync, gzipSync } from "zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "charges-archive";
const PAGE = 1000;

type ArchiveRow = Record<string, unknown> & { id: string };

interface ArchiveProvider {
  provider_id: string;
  rows: number;
  last_archived: string;
}

const objectName = (providerId: string) => `${providerId}.ndjson.gz`;

function parseArgs(argv: string[]) {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dryRun: argv.includes("--dry-run"),
    limit: value("--limit") ? Number(value("--limit")) : undefined,
    concurrency: Number(value("--concurrency") ?? 2),
    restore: value("--restore"),
  };
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** Every object in the bucket, by name, with its last write time. */
async function listObjects(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${BUCKET}: ${error.message}`);
    for (const o of data ?? []) out.set(o.name, o.updated_at ?? o.created_at);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function archivedRows(
  supabase: SupabaseClient,
  providerId: string
): Promise<ArchiveRow[]> {
  const rows: ArchiveRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await withRetry(async () => {
      const { data, error } = await supabase
        .from("charges_archive")
        .select("*")
        .eq("provider_id", providerId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`charges_archive: ${error.message}`);
      return (data ?? []) as ArchiveRow[];
    });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function readObject(
  supabase: SupabaseClient,
  providerId: string
): Promise<ArchiveRow[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(objectName(providerId));
  if (error) throw new Error(`download ${providerId}: ${error.message}`);
  const text = gunzipSync(Buffer.from(await data.arrayBuffer())).toString();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ArchiveRow);
}

async function exportProvider(
  supabase: SupabaseClient,
  p: ArchiveProvider,
  hasObject: boolean
): Promise<{ rows: number; merged: number; bytes: number }> {
  const rows = await archivedRows(supabase, p.provider_id);
  if (rows.length !== p.rows) {
    throw new Error(
      `${p.provider_id}: read ${rows.length} rows, expected ${p.rows}`
    );
  }
  // Rows from earlier loads may already be purged from the table; keep them.
  const byId = new Map<string, ArchiveRow>();
  if (hasObject) {
    for (const r of await readObject(supabase, p.provider_id))
      byId.set(r.id, r);
  }
  const earlier = byId.size;
  for (const r of rows) byId.set(r.id, r);

  const body = gzipSync(
    [...byId.values()].map((r) => JSON.stringify(r)).join("\n") + "\n"
  );
  await withRetry(async () => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(objectName(p.provider_id), body, {
        contentType: "application/gzip",
        upsert: true,
      });
    if (error) throw new Error(`upload ${p.provider_id}: ${error.message}`);
  });

  // Read it back: every archived row must be in the file before the purge
  // may drop it.
  const back = new Set(
    (await readObject(supabase, p.provider_id)).map((r) => r.id)
  );
  const missing = rows.filter((r) => !back.has(r.id)).length;
  if (missing > 0 || back.size !== byId.size) {
    throw new Error(
      `${p.provider_id}: file check failed (${missing} rows missing, ${back.size} of ${byId.size} in file)`
    );
  }
  return { rows: rows.length, merged: earlier, bytes: body.length };
}

async function runExport(
  supabase: SupabaseClient,
  opts: ReturnType<typeof parseArgs>
) {
  const providers: ArchiveProvider[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc("charges_archive_providers")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`charges_archive_providers: ${error.message}`);
    providers.push(...((data ?? []) as ArchiveProvider[]));
    if (!data || data.length < PAGE) break;
  }
  const objects = await listObjects(supabase);
  const todo = providers
    .filter((p) => {
      const written = objects.get(objectName(p.provider_id));
      return !written || Date.parse(written) < Date.parse(p.last_archived);
    })
    .slice(0, opts.limit);
  const totalRows = todo.reduce((s, p) => s + Number(p.rows), 0);
  console.log(
    `${providers.length} hospitals in charges_archive; ${todo.length} to export (${totalRows.toLocaleString()} rows)`
  );
  if (opts.dryRun) return;

  let done = 0;
  let rows = 0;
  let bytes = 0;
  const failed: string[] = [];
  const queue = [...todo];
  async function worker() {
    for (;;) {
      const p = queue.shift();
      if (!p) return;
      try {
        const r = await exportProvider(
          supabase,
          p,
          objects.has(objectName(p.provider_id))
        );
        rows += r.rows;
        bytes += r.bytes;
      } catch (err) {
        failed.push(p.provider_id);
        console.error(err instanceof Error ? err.message : err);
      }
      if (++done % 25 === 0 || done === todo.length) {
        console.log(
          `  ${done} of ${todo.length} hospitals, ${rows.toLocaleString()} rows, ${(bytes / 1e6).toFixed(1)} MB`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  console.log(
    `Exported ${rows.toLocaleString()} rows for ${todo.length - failed.length} hospitals (${(bytes / 1e6).toFixed(1)} MB gzipped).`
  );
  if (failed.length > 0) {
    console.error(`${failed.length} failed: ${failed.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("The nightly purge (05:15 UTC) frees their table space.");
  }
}

async function runRestore(supabase: SupabaseClient, providerId: string) {
  const { count, error } = await supabase
    .from("charges_archive")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  if (error) throw new Error(`charges_archive: ${error.message}`);
  if (count) {
    throw new Error(
      `${providerId} already has ${count} rows in charges_archive; run restore_mrf_load() directly`
    );
  }
  const rows = await readObject(supabase, providerId);
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await withRetry(async () => {
      const { error: e } = await supabase.from("charges_archive").insert(batch);
      if (e) throw new Error(`insert: ${e.message}`);
    });
  }
  console.log(
    `Put ${rows.length} rows back in charges_archive for ${providerId}. Next: select restore_mrf_load('${providerId}');`
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  if (opts.restore) await runRestore(supabase, opts.restore);
  else await runExport(supabase, opts);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
