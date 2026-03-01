/**
 * Repeatability smoke test for /api/search stability.
 *
 * Usage:
 *   npx tsx scripts/stability-smoke.ts \
 *     --query "knee mri w/ contrast" \
 *     --lat 40.7695 \
 *     --lng -74.0204 \
 *     --runs 20 \
 *     --radius 25 \
 *     --base-url http://localhost:3000
 */

interface ParsedArgs {
  query: string;
  lat: number;
  lng: number;
  runs: number;
  radius: number;
  baseUrl: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }

  const query = args.get("query") || "";
  const lat = Number(args.get("lat"));
  const lng = Number(args.get("lng"));
  const runs = Number(args.get("runs") || "20");
  const radius = Number(args.get("radius") || "25");
  const baseUrl = args.get("base-url") || "http://localhost:3000";

  if (!query || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(runs)) {
    throw new Error(
      "Missing required args. Expected: --query <text> --lat <num> --lng <num> [--runs <num>] [--radius <num>] [--base-url <url>]"
    );
  }

  return {
    query,
    lat,
    lng,
    runs: Math.max(1, Math.floor(runs)),
    radius: Number.isFinite(radius) ? radius : 25,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

function codeSignature(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidate = payload as Record<string, unknown>;
  if (!Array.isArray(candidate.cptCodes)) return "";
  const values = candidate.cptCodes
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const raw = entry as Record<string, unknown>;
      if (typeof raw.code !== "string") return [];
      const codeType =
        raw.codeType === "hcpcs" || raw.codeType === "ms_drg"
          ? raw.codeType
          : "cpt";
      return [`${codeType}:${raw.code.toUpperCase()}`];
    })
    .sort();
  return values.join(",");
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const endpoint = `${args.baseUrl}/api/search`;

  let zeroResultRuns = 0;
  let failedRuns = 0;
  const signatures = new Set<string>();

  console.log(`Running stability smoke: ${args.runs} runs`);
  console.log(`Query: "${args.query}" @ (${args.lat}, ${args.lng}), radius=${args.radius} miles`);
  console.log(`Endpoint: ${endpoint}`);
  console.log("");

  for (let runIndex = 1; runIndex <= args.runs; runIndex += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: args.query,
          location: {
            lat: args.lat,
            lng: args.lng,
            radiusMiles: args.radius,
          },
        }),
      });

      const elapsedMs = Date.now() - startedAt;
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      const parsed = payload as { totalResults?: unknown; results?: unknown[] } | null;
      const totalResults =
        typeof parsed?.totalResults === "number"
          ? parsed.totalResults
          : Array.isArray(parsed?.results)
            ? parsed.results.length
            : 0;
      const signature = codeSignature(payload);
      if (signature) signatures.add(signature);

      if (!response.ok) {
        failedRuns += 1;
      }
      if (!response.ok || totalResults === 0) {
        zeroResultRuns += 1;
      }

      console.log(
        `[${runIndex}/${args.runs}] status=${response.status} totalResults=${totalResults} elapsedMs=${elapsedMs}`
      );
    } catch (error) {
      failedRuns += 1;
      zeroResultRuns += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${runIndex}/${args.runs}] request_failed=${message}`);
    }
  }

  console.log("");
  console.log("Summary:");
  console.log(`- runs: ${args.runs}`);
  console.log(`- zero_result_runs: ${zeroResultRuns}`);
  console.log(`- failed_runs: ${failedRuns}`);
  console.log(`- distinct_code_signatures: ${signatures.size}`);
  if (signatures.size > 0) {
    console.log(`- code_signatures: ${Array.from(signatures).join(" | ")}`);
  }

  if (zeroResultRuns > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
