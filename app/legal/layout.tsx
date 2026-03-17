"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/disclaimers", label: "Disclaimers" },
];

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <nav className="flex gap-2 mb-8">
        {LEGAL_PAGES.map((page) => {
          const isActive = pathname === page.href;
          return (
            <Link
              key={page.href}
              href={page.href}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                isActive
                  ? "font-medium"
                  : "hover:border-[var(--cc-primary)] hover:text-[var(--cc-primary)]"
              }`}
              style={{
                borderColor: isActive
                  ? "var(--cc-primary)"
                  : "var(--cc-border)",
                color: isActive
                  ? "var(--cc-primary)"
                  : "var(--cc-text-secondary)",
                background: isActive ? "#f0fdf9" : "transparent",
              }}
            >
              {page.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
