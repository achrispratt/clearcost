/**
 * Checks that a data load or modification lost nothing and changed only what
 * it meant to (docs/data-checks.md).
 *
 *   # before the change: snapshot, naming the states it will touch
 *   npx tsx --env-file=.env.local scripts/data-check.ts snapshot --label before-tx --state TX
 *   # ...run the load, migration or cleanup...
 *   npx tsx --env-file=.env.local scripts/data-check.ts snapshot --label after-tx --state TX
 *   npx tsx --env-file=.env.local scripts/data-check.ts compare before-tx after-tx
 *
 *   # nightly ledger: hospitals or codes whose coverage fell overnight
 *   npx tsx --env-file=.env.local scripts/data-check.ts ledger [--before 2026-10-19 --after 2026-10-20]
 *
 * compare and ledger exit 1 when something failed. Snapshots and reports name
 * hospitals, so they go to the project folder (or --dir), never the repo.
 * Read-only against the database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import { createAdminClient } from "@/lib/supabase/admin";
import { takeSnapshot } from "@/lib/data-checks/capture";
import { compareSnapshots, formatReport } from "@/lib/data-checks/compare";
import { SNAPSHOT_VERSION, type Snapshot } from "@/lib/data-checks/types";

const PROJECT_DIR = "/mnt/project-files/data-quality/checks";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const next = argv[i + 1];
    const value = next && !next.startsWith("--") ? argv[++i] : "true";
    flags.set(token.slice(2), [...(flags.get(token.slice(2)) ?? []), value]);
  }
  return { positional, flags };
}

function outDir(flags: Map<string, string[]>): string {
  const dir =
    flags.get("dir")?.[0] ??
    (existsSync("/mnt/project-files") ? PROJECT_DIR : "data-checks");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function snapshotPath(dir: string, label: string): string {
  return label.endsWith(".json.gz") ? label : join(dir, `${label}.json.gz`);
}

function readSnapshot(path: string): Snapshot {
  const snapshot = JSON.parse(gunzipSync(readFileSync(path)).toString());
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(
      `${path}: snapshot version ${snapshot.version}, expected ${SNAPSHOT_VERSION}`
    );
  }
  return snapshot;
}

function states(flags: Map<string, string[]>): string[] {
  return (flags.get("state") ?? [])
    .flatMap((s) => s.split(","))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

async function snapshot(flags: Map<string, string[]>) {
  const label = flags.get("label")?.[0];
  if (!label || label === "true") throw new Error("--label is required");
  const dir = outDir(flags);
  const path = snapshotPath(dir, label);
  if (existsSync(path) && !flags.has("overwrite")) {
    throw new Error(`${path} exists; pick another --label or pass --overwrite`);
  }
  const started = Date.now();
  const result = await takeSnapshot(createAdminClient(), {
    label,
    states: states(flags),
    onProgress: (done, total) => {
      if (done % 250 === 0 || done === total) {
        console.log(`  ${done} of ${total} searches`);
      }
    },
  });
  writeFileSync(path, gzipSync(JSON.stringify(result)));
  const hospitals = result.searches.reduce((n, s) => n + s.hospitals.length, 0);
  console.log(
    `Wrote ${path}: ${result.searches.length} searches (${hospitals} hospital results), ` +
      `${Object.keys(result.providers).length} hospitals fingerprinted, ` +
      `${Math.round((Date.now() - started) / 1000)}s`
  );
}

function compare(positional: string[], flags: Map<string, string[]>) {
  const [beforeLabel, afterLabel] = positional;
  if (!beforeLabel || !afterLabel) {
    throw new Error("usage: compare <before-label> <after-label> [--state TX]");
  }
  const dir = outDir(flags);
  const before = readSnapshot(snapshotPath(dir, beforeLabel));
  const after = readSnapshot(snapshotPath(dir, afterLabel));
  const scope = states(flags);
  const result = compareSnapshots(
    before,
    after,
    scope.length ? scope : undefined
  );
  const report = formatReport(before, after, result);
  const reportPath = join(dir, `${before.label}--${after.label}.md`);
  writeFileSync(reportPath, report);

  console.log(report.split("\n## ")[0].trim());
  console.log(`\nFull report: ${reportPath}`);
  if (result.counts.fail > 0) process.exit(1);
}

interface DropRow {
  kind: "total" | "provider" | "code";
  key: string;
  before_value: number;
  after_value: number;
}

async function ledger(flags: Map<string, string[]>) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("coverage_drops", {
    p_before: flags.get("before")?.[0] ?? null,
    p_after: flags.get("after")?.[0] ?? null,
  });
  if (error) throw new Error(`coverage_drops: ${error.message}`);
  const rows = (data ?? []) as DropRow[];
  if (rows.length === 0) {
    console.log("Fewer than two nightly coverage snapshots yet.");
    return;
  }

  console.log("Coverage, before → after:");
  for (const r of rows.filter((r) => r.kind === "total")) {
    console.log(`  ${r.key}: ${r.before_value} → ${r.after_value}`);
  }

  const providerRows = rows.filter((r) => r.kind === "provider");
  const names = new Map<string, string>();
  if (providerRows.length > 0) {
    const { data: providers } = await supabase
      .from("providers")
      .select("id, name, state")
      .in(
        "id",
        providerRows.slice(0, 500).map((r) => r.key)
      );
    for (const p of providers ?? []) names.set(p.id, `${p.name} (${p.state})`);
  }
  console.log(`\nHospitals that lost priced codes: ${providerRows.length}`);
  for (const r of providerRows.slice(0, 100)) {
    console.log(
      `  ${names.get(r.key) ?? r.key}: ${r.before_value} → ${r.after_value}`
    );
  }
  const codeRows = rows.filter((r) => r.kind === "code");
  console.log(`\nCodes priced by fewer hospitals: ${codeRows.length}`);
  for (const r of codeRows.slice(0, 100)) {
    console.log(`  ${r.key}: ${r.before_value} → ${r.after_value} hospitals`);
  }
  if (providerRows.length > 0 || codeRows.length > 0) process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  if (command === "snapshot") return snapshot(flags);
  if (command === "compare") return compare(positional, flags);
  if (command === "ledger") return ledger(flags);
  throw new Error(
    "usage: data-check.ts snapshot | compare | ledger (see the file header)"
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
