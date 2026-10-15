import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_CHARS = 254;
const MAX_NAME_CHARS = 200;
const MAX_CODE_CHARS = 20;

/** "Notify me when this can be priced." Anonymous; consent is required. */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, procedureCode, procedureName, consent } = (body ??
    {}) as Record<string, unknown>;

  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const cleanName =
    typeof procedureName === "string" ? procedureName.trim() : "";
  const cleanCode =
    typeof procedureCode === "string" ? procedureCode.trim() : "";

  if (
    consent !== true ||
    !EMAIL_PATTERN.test(cleanEmail) ||
    cleanEmail.length > MAX_EMAIL_CHARS ||
    !cleanName ||
    cleanName.length > MAX_NAME_CHARS ||
    cleanCode.length > MAX_CODE_CHARS
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } = await createAdminClient().from("waitlist_emails").upsert(
    {
      email: cleanEmail,
      procedure_code: cleanCode,
      procedure_name: cleanName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email,procedure_code" }
  );

  if (error) {
    console.error("Waitlist insert failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
