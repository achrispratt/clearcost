"use client";

import type { CPTCode } from "@/types";
import { CopyButton } from "./CopyButton";

const CODE_TYPE_LABEL: Record<string, string> = {
  cpt: "CPT",
  hcpcs: "HCPCS",
  ms_drg: "MS-DRG",
};

interface CodesDrawerProps {
  codes: CPTCode[];
}

/**
 * Billing codes are for the front desk, not the shopper: they live in a
 * collapsed drawer with a copy button for calling a hospital to confirm.
 */
export function CodesDrawer({ codes }: CodesDrawerProps) {
  if (codes.length === 0) return null;

  const copyText = codes
    .map(
      (c) =>
        `${CODE_TYPE_LABEL[c.codeType ?? "cpt"] ?? "CPT"} ${c.code}: ${c.description}`
    )
    .join("\n");

  return (
    <details
      className="group rounded-xl border"
      style={{
        borderColor: "var(--cc-border)",
        background: "var(--cc-surface)",
      }}
    >
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="text-sm" style={{ color: "var(--cc-text)" }}>
          <span className="font-semibold">For your doctor&rsquo;s office</span>
          <span style={{ color: "var(--cc-text-tertiary)" }}>
            {" "}
            · billing code{codes.length > 1 ? "s" : ""}{" "}
            <span className="code">{codes.map((c) => c.code).join(", ")}</span>
          </span>
        </span>
        <svg
          className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180"
          style={{ color: "var(--cc-text-tertiary)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="px-4 pb-4">
        <p
          className="text-[13px] mb-3"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          When you call to confirm a price, give the hospital this code so you
          get a quote for the same thing.
        </p>
        <ul className="space-y-2 mb-3">
          {codes.map((c) => (
            <li key={`${c.codeType}-${c.code}`} className="text-[13px]">
              <span
                className="code font-semibold"
                style={{ color: "var(--cc-text)" }}
              >
                {CODE_TYPE_LABEL[c.codeType ?? "cpt"] ?? "CPT"} {c.code}
              </span>
              <span style={{ color: "var(--cc-text-secondary)" }}>
                {" "}
                {c.description}
              </span>
            </li>
          ))}
        </ul>
        <CopyButton
          text={copyText}
          label={codes.length > 1 ? "Copy codes" : "Copy code"}
        />
      </div>
    </details>
  );
}
