// Embeds a short text with Supabase's built-in gte-small model (384 dims,
// English-only) for KB canonical matching (#164). Called server-side only, with
// the service role key, from lib/kb/semantic.ts. Keep the model in sync with
// AI_MODELS.queryEmbedding in lib/ai/models.ts.
// Deploy: supabase functions deploy embed

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_INPUT_CHARS = 500;
const session = new Supabase.ai.Session("gte-small");

// The gateway (verify_jwt) has already checked the signature; also require the
// service role so the public anon key can't spend embedding calls.
function isServiceRole(req: Request): boolean {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  const payload = token?.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

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
