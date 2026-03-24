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
      <Link
        href="/"
        className="text-lg group-hover:opacity-80 transition-opacity group"
        style={{
          fontFamily: "var(--font-instrument-serif), Georgia, serif",
          fontWeight: 500,
        }}
      >
        <span style={{ color: "var(--cc-text)" }}>Clear</span>
        <span style={{ color: "var(--cc-primary)" }}>Cost</span>
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
