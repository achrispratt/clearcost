import { detectEmergency } from "@/lib/emergency";

interface EmergencyBannerProps {
  texts: (string | null | undefined)[];
}

/** Shown when the search text suggests an emergency. Never judges urgency. */
export function EmergencyBanner({ texts }: EmergencyBannerProps) {
  const kind = detectEmergency(...texts);
  if (!kind) return null;

  return (
    <div
      role="alert"
      className="p-4 rounded-xl border text-[15px] leading-relaxed"
      style={{
        background: "var(--cc-error-light)",
        borderColor: "rgba(220, 38, 38, 0.25)",
        color: "var(--cc-text)",
      }}
    >
      <p className="font-semibold" style={{ color: "var(--cc-error)" }}>
        If this might be an emergency, call 911 now.
      </p>
      {kind === "crisis" && (
        <p className="mt-1">
          If you are thinking about hurting yourself, call or text{" "}
          <a href="tel:988" className="font-semibold underline">
            988
          </a>{" "}
          (Suicide &amp; Crisis Lifeline), any time, free.
        </p>
      )}
      <p className="mt-1">
        Emergency rooms must screen and stabilize you whether or not you can
        pay. Don&apos;t wait to compare prices.
      </p>
    </div>
  );
}
