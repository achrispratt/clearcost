"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the text
      // is on screen either way.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:bg-[var(--cc-primary-light)] ${className ?? ""}`}
      style={{
        borderColor: "var(--cc-primary)",
        color: "var(--cc-primary)",
        background: "var(--cc-surface)",
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
