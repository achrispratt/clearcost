"use client";

import { useId, useState } from "react";
import Link from "next/link";

interface NotifyMeProps {
  procedureName: string;
  procedureCode?: string;
}

type Status = "idle" | "submitting" | "done" | "error";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email sign-up for a search ClearCost can't price yet (#149). */
export function NotifyMe({ procedureName, procedureCode }: NotifyMeProps) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [invalid, setInvalid] = useState(false);
  const emailId = useId();
  const consentId = useId();

  if (status === "done") {
    return (
      <p
        className="mt-4 text-[14px] font-medium"
        style={{ color: "var(--cc-primary)" }}
        role="status"
      >
        You&rsquo;re on the list. We&rsquo;ll email you when we can price this.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setInvalid(true);
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          procedureName,
          procedureCode: procedureCode ?? "",
          consent,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  const busy = status === "submitting";

  return (
    <form onSubmit={submit} className="mt-4" noValidate>
      <label
        htmlFor={emailId}
        className="block text-sm font-semibold mb-2"
        style={{ color: "var(--cc-text)" }}
      >
        Get an email when we can price this
      </label>
      <div className="flex gap-2">
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setInvalid(false);
          }}
          disabled={busy}
          aria-invalid={invalid}
          placeholder="you@example.com"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-[15px] bg-transparent"
          style={{
            borderColor: "var(--cc-border-strong)",
            color: "var(--cc-text)",
          }}
        />
        <button
          type="submit"
          disabled={busy || !consent}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
          style={{ background: "var(--cc-primary)" }}
        >
          {busy ? "Saving…" : "Notify me"}
        </button>
      </div>
      <div className="flex items-start gap-2 mt-2">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
          className="mt-1"
        />
        <label
          htmlFor={consentId}
          className="text-[13px] leading-snug"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          Email me once about {procedureName}. ClearCost stores my email and
          this search for that purpose only, as described in the{" "}
          <Link
            href="/legal/privacy#waitlist"
            className="underline"
            style={{ color: "var(--cc-primary)" }}
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>
      {invalid && (
        <p className="mt-2 text-[13px]" style={{ color: "var(--cc-error)" }}>
          Please enter a valid email address.
        </p>
      )}
      {status === "error" && (
        <p
          className="mt-2 text-[13px]"
          style={{ color: "var(--cc-error)" }}
          role="alert"
        >
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}
