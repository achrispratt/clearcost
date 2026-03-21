/**
 * One-time cleanup: delete depth-0 resolution nodes from kb_nodes.
 *
 * These are stale artifacts from the old code path where /api/cpt wrote
 * resolution nodes at the root of the KB tree, causing the guided search
 * diagnostic to be bypassed.
 *
 * OPTIONAL: The server guard in /api/clarify already skips these at runtime,
 * and the upsert in writeNode now overwrites them when a question node is
 * written at the same path_hash. This script just pre-cleans the stale data.
 *
 * Note: /api/cpt still READS depth-0 resolutions from KB, but since we
 * stopped it from WRITING new ones (Task 5), these will naturally be replaced
 * by question nodes as guided searches overwrite them.
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: nodes, error: fetchError } = await supabase
    .from("kb_nodes")
    .select("path_hash, canonical_query, node_type, hit_count")
    .eq("depth", 0)
    .eq("node_type", "resolution");

  if (fetchError) {
    console.error("Failed to fetch nodes:", fetchError);
    process.exit(1);
  }

  if (!nodes || nodes.length === 0) {
    console.log("No depth-0 resolution nodes found. Nothing to clean up.");
    return;
  }

  console.log(`Found ${nodes.length} depth-0 resolution nodes to delete:`);
  for (const node of nodes) {
    console.log(
      `  - "${node.canonical_query}" (hits: ${node.hit_count}, hash: ${node.path_hash})`
    );
  }

  const hashes = nodes.map((n) => n.path_hash);
  const { error: deleteError, count } = await supabase
    .from("kb_nodes")
    .delete({ count: "exact" })
    .in("path_hash", hashes);

  if (deleteError) {
    console.error("Failed to delete nodes:", deleteError);
    process.exit(1);
  }

  console.log(`\nDeleted ${count} depth-0 resolution nodes.`);
  console.log(
    "New question nodes will be created as users go through the diagnostic."
  );
}

main();
