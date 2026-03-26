"use client";

import Link from "next/link";
import { AuthButton } from "./AuthButton";
import { useNavbarSlot } from "./NavbarContext";

export function Navbar() {
  const { searchSlot } = useNavbarSlot();

  return (
    <nav
      className="sticky top-0 z-50 border-b px-4 lg:px-6 flex items-center gap-4"
      style={{
        background: "rgba(250, 250, 248, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "var(--cc-border)",
        height: searchSlot ? "auto" : "56px",
        padding: searchSlot ? "8px 16px" : undefined,
      }}
    >
      <Link href="/" className="flex items-center gap-2 group shrink-0">
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
          className="text-lg group-hover:opacity-80 transition-opacity hidden sm:inline"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          ClearCost
        </span>
      </Link>

      {/* Search slot — injected by results page via NavbarContext */}
      {searchSlot && <div className="flex-1 min-w-0">{searchSlot}</div>}

      <div className="flex items-center gap-1 shrink-0">
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
