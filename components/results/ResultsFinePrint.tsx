import Link from "next/link";
import type { ChargeResult } from "@/types";

interface ResultsFinePrintProps {
  results: ChargeResult[];
}

function fileDateRange(results: ChargeResult[]): string | null {
  const times = results
    .map((r) => (r.lastUpdated ? Date.parse(r.lastUpdated) : NaN))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const from = fmt(Math.min(...times));
  const to = fmt(Math.max(...times));
  return from === to ? from : `${from} to ${to}`;
}

/** What the prices are, where they come from, and the patient's rights. */
export function ResultsFinePrint({ results }: ResultsFinePrintProps) {
  const dates = fileDateRange(results);

  return (
    <footer
      className="pt-4 mt-2 border-t text-[13px] leading-relaxed space-y-2"
      style={{
        borderColor: "var(--cc-border)",
        color: "var(--cc-text-secondary)",
      }}
    >
      <p>
        These are estimates from prices hospitals publish under federal price
        transparency rules
        {dates ? `, from files dated ${dates}` : ""}. They are not a quote or a
        bill, and the hospital may charge a different amount.
        &ldquo;Lowest&rdquo; means the lowest published price we found, not a
        guaranteed price.
      </p>
      <p>
        If you are uninsured or paying cash, you have the right to a written
        Good Faith Estimate from the provider before you schedule care, and you
        can dispute a bill that comes in $400 or more above it.
      </p>
      <p>
        Billing codes are matched by AI from what you typed and may differ from
        what your provider bills. CPT is a registered trademark of the American
        Medical Association.{" "}
        <Link
          href="/legal/disclaimers"
          className="underline"
          style={{ color: "var(--cc-primary)" }}
        >
          More about these prices
        </Link>
      </p>
    </footer>
  );
}
