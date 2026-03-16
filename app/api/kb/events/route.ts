import { NextRequest, NextResponse } from "next/server";
import { logKBEvent } from "@/lib/kb/events";
import type { KBEventType } from "@/types";

const VALID_EVENT_TYPES: KBEventType[] = [
  "walk",
  "result_click",
  "save",
  "bounce",
  "skip",
];

export async function POST(request: NextRequest) {
  try {
    const { pathHash, eventType, sessionId } = await request.json();

    if (
      typeof pathHash !== "string" ||
      typeof sessionId !== "string" ||
      !VALID_EVENT_TYPES.includes(eventType)
    ) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    await logKBEvent({ pathHash, eventType, sessionId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }
}
