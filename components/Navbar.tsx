"use client";

import Link from "next/link";
import { AuthButton } from "./AuthButton";

export function Navbar() {
  return (
    <nav
      className="sticky top-0 z-50 border-b px-4 lg:px-8 h-14 flex items-center justify-between"
      style={{
        background: "rgba(250, 250, 248, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--cc-border)",
      }}
    >
      <Link href="/" className="flex items-center gap-2 group">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: "var(--cc-primary)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v20M2 12h20" />
          </svg>
        </div>
        <span
          className="text-lg group-hover:opacity-80 transition-opacity"
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          ClearCost
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <Link
          href="/saved"
          className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[var(--cc-surface-alt)] transition-colors"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          Saved
        </Link>
        <AuthButton />
      </div>
    </nav>
  );
}
