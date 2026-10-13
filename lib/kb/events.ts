import { createAdminClient } from "@/lib/supabase/admin";
import type { KBEventType } from "@/types";

export async function logKBEvent(params: {
  pathHash: string;
  eventType: KBEventType;
  sessionId: string;
}): Promise<void> {
  const { pathHash, eventType, sessionId } = params;
  const supabase = createAdminClient();

  const { error } = await supabase.from("kb_events").insert({
    path_hash: pathHash,
    event_type: eventType,
    session_id: sessionId,
  });

  if (error) {
    console.error("KB event log failed:", error);
  }
}
