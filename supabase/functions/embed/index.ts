// Embeds a short text with Supabase's built-in gte-small model (384 dims,
// English-only) for KB canonical matching (#164). Called server-side only, with
// the service role key, from lib/kb/semantic.ts. Keep the model in sync with
// AI_MODELS.queryEmbedding in lib/ai/models.ts.
// Deploy: supabase functions deploy embed

const MAX_INPUT_CHARS = 500;
const session = new Supabase.ai.Session("gte-small");

Deno.serve(async (req) => {
  let input: unknown;
  try {
    ({ input } = await req.json());
  } catch {
    input = undefined;
  }

  if (
    typeof input !== "string" ||
    !input.trim() ||
    input.length > MAX_INPUT_CHARS
  ) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const embedding = await session.run(input, {
    mean_pool: true,
    normalize: true,
  });
  return Response.json({ embedding });
});
