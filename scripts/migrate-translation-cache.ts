import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: rows, error } = await supabase
    .from("translation_cache")
    .select("query_hash, normalized_query, payload, hit_count");

  if (error) {
    console.error("Failed to fetch translation_cache:", error);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("No rows in translation_cache to migrate.");
    return;
  }

  console.log(`Migrating ${rows.length} translation_cache entries...`);

  let synonymsWritten = 0;
  let nodesWritten = 0;
  let skipped = 0;

  for (const row of rows) {
    const canonicalQuery = row.normalized_query;
    const queryHash = row.query_hash;
    const payload = row.payload;

    if (!payload || !Array.isArray(payload.codes)) {
      skipped++;
      continue;
    }

    const { error: synError } = await supabase.from("kb_synonyms").upsert(
      {
        query_hash: queryHash,
        normalized_query: canonicalQuery,
        canonical_query: canonicalQuery,
      },
      { onConflict: "query_hash" }
    );

    if (synError) {
      console.error(`Synonym write failed for ${canonicalQuery}:`, synError);
      continue;
    }
    synonymsWritten++;

    const pathHash = sha256(canonicalQuery + "|");
    const { error: nodeError } = await supabase.from("kb_nodes").upsert(
      {
        path_hash: pathHash,
        canonical_query: canonicalQuery,
        answer_path: [],
        depth: 0,
        node_type: "resolution",
        payload: {
          type: "resolution",
          codes: payload.codes,
          interpretation: payload.interpretation || "",
          searchTerms: payload.searchTerms,
          queryType: payload.queryType,
          pricingPlan: payload.pricingPlan,
          laterality: payload.laterality,
          bodySite: payload.bodySite,
          confidence: "high",
          conversationComplete: true,
        },
        hit_count: row.hit_count || 0,
        version: 1,
        source: "migrated",
      },
      { onConflict: "path_hash", ignoreDuplicates: true }
    );

    if (nodeError) {
      console.error(`Node write failed for ${canonicalQuery}:`, nodeError);
      continue;
    }
    nodesWritten++;
  }

  console.log(`Migration complete:`);
  console.log(`  Synonyms written: ${synonymsWritten}`);
  console.log(`  Nodes written: ${nodesWritten}`);
  console.log(`  Skipped (invalid payload): ${skipped}`);
  console.log(
    `\nNext steps: verify data in kb_synonyms/kb_nodes, then drop translation_cache.`
  );
}

main();
