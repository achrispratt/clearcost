import { AI_MODELS } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeQuery } from "./path-hash";

// Semantic KB matching (#164): a new phrasing of a known query ("mri of my
// knee" → "knee mri") is matched by embedding similarity in Postgres, so it
// is served from the cached tree without a Claude call.

/**
 * Minimum cosine similarity for a match. Deliberately strict: a false match
 * sends the patient down the wrong tree, while a miss only costs a Claude
 * call. Tune with scripts/tune-kb-match-threshold.ts on real query pairs
 * ("knee pain" must NOT match "knee mri"). Tuned 2026-10-14 on gte-small:
 * should-match pairs scored >= 0.932, should-not pairs <= 0.908.
 */
export const MATCH_THRESHOLD = 0.92;

/** Past this, fall through to Claude so matching never makes search slower. */
export const EMBED_TIMEOUT_MS = 500;

const { model, dimensions } = AI_MODELS.queryEmbedding;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Embeds text via the `embed` Edge Function. Returns null on any failure. */
export async function embedText(text: string): Promise<number[] | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: normalizeQuery(text) },
  });

  const embedding = (data as { embedding?: unknown } | null)?.embedding;
  if (
    error ||
    !Array.isArray(embedding) ||
    embedding.length !== dimensions ||
    !embedding.every((v) => typeof v === "number")
  ) {
    if (error) console.error("KB embed failed:", error);
    return null;
  }
  return embedding;
}

async function findCanonical(query: string): Promise<string | null> {
  const embedding = await embedText(query);
  if (!embedding) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("match_canonical", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: MATCH_THRESHOLD,
    match_count: 1,
  });

  if (error) {
    console.error("KB canonical match failed:", error);
    return null;
  }
  const row = (data as { canonical_query: string }[] | null)?.[0];
  return row?.canonical_query ?? null;
}

/**
 * Nearest known canonical query above MATCH_THRESHOLD, or null on a miss,
 * an error, or when embedding + matching takes longer than EMBED_TIMEOUT_MS.
 */
export async function matchCanonical(query: string): Promise<string | null> {
  return withTimeout(
    findCanonical(query).catch((err) => {
      console.error("KB canonical match failed:", err);
      return null;
    }),
    EMBED_TIMEOUT_MS
  );
}

/**
 * Stores the embedding for a canonical that now has a depth-0 question node.
 * First write wins, like kb_nodes. No timeout: this runs off the request path.
 */
export async function writeCanonicalEmbedding(
  canonicalQuery: string
): Promise<boolean> {
  const embedding = await embedText(canonicalQuery);
  if (!embedding) return false;

  const supabase = createAdminClient();
  const { error } = await supabase.from("kb_canonical_embeddings").upsert(
    {
      canonical_query: canonicalQuery,
      embedding: JSON.stringify(embedding),
      model,
    },
    { onConflict: "canonical_query", ignoreDuplicates: true }
  );

  if (error) {
    console.error("KB canonical embedding write failed:", error);
    return false;
  }
  return true;
}
