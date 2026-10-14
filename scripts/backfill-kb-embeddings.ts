/**
 * One-time backfill (#164): embed every canonical query that has a depth-0
 * question node, so semantic matching can find existing trees. Safe to re-run:
 * canonicals that already have an embedding are skipped.
 *
 * Needs the 20261014_kb_canonical_embeddings migration and the `embed` Edge
 * Function deployed first.
 * Run: npx tsx --env-file=.env.local scripts/backfill-kb-embeddings.ts
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { writeCanonicalEmbedding } from "@/lib/kb/semantic";

async function main() {
  const supabase = createAdminClient();

  const [{ data: roots, error: rootsError }, { data: done, error: doneError }] =
    await Promise.all([
      supabase
        .from("kb_nodes")
        .select("canonical_query")
        .eq("depth", 0)
        .eq("node_type", "question"),
      supabase.from("kb_canonical_embeddings").select("canonical_query"),
    ]);

  if (rootsError || doneError || !roots || !done) {
    console.error("Failed to read KB:", rootsError ?? doneError);
    process.exit(1);
  }

  const embedded = new Set(done.map((r) => r.canonical_query));
  const todo = [...new Set(roots.map((r) => r.canonical_query))].filter(
    (q) => !embedded.has(q)
  );
  console.log(`${embedded.size} already embedded, ${todo.length} to embed.`);

  let failed = 0;
  for (const canonical of todo) {
    const ok = await writeCanonicalEmbedding(canonical);
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${canonical}`);
  }

  console.log(`Done: ${todo.length - failed} embedded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
