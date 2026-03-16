"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { formatApproxCount } from "@/lib/format";

export function HeroSection() {
  const router = useRouter();

  const handleSearch = (
    query: string,
    location: { lat: number; lng: number; display: string }
  ) => {
    const params = new URLSearchParams({
      q: query,
      lat: location.lat.toString(),
      lng: location.lng.toString(),
      loc: location.display,
    });
    router.push(`/guided-search?${params.toString()}`);
  };

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-4 py-16 sm:py-24 relative hero-gradient">
      {/* Dot grid background */}
      <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-3xl mx-auto">
        {/* Label */}
        <span
          className="text-xs font-semibold tracking-widest uppercase mb-6 animate-fade-up"
          style={{
            color: "var(--cc-primary)",
            animationDelay: "0s",
          }}
        >
          Healthcare Pricing Transparency
        </span>

        {/* Heading */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl leading-tight mb-5 animate-fade-up"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
            animationDelay: "0.08s",
          }}
        >
          Know what you&rsquo;ll pay
          <br />
          <span style={{ color: "var(--cc-primary)" }}>before you go.</span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-base sm:text-lg max-w-lg mb-10 animate-fade-up"
          style={{
            color: "var(--cc-text-secondary)",
            animationDelay: "0.16s",
          }}
        >
          Compare real hospital prices across {formatApproxCount(5400)}{" "}
          providers. Search in plain English. No insurance required.
        </p>

        {/* Search Bar */}
        <div
          className="w-full animate-fade-up"
          style={{ animationDelay: "0.24s" }}
        >
          <SearchBar onSearch={handleSearch} />
        </div>

        {/* Stats Row */}
        <div
          className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mt-10 animate-fade-up"
          style={{ animationDelay: "0.32s" }}
        >
          {[
            { value: formatApproxCount(5400), label: "hospitals" },
            { value: formatApproxCount(10_000_000), label: "prices" },
            { value: formatApproxCount(1000), label: "procedures" },
          ].map((stat, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <span
                className="text-lg sm:text-xl font-semibold"
                style={{ color: "var(--cc-text)" }}
              >
                {stat.value}
              </span>
              <span
                className="text-sm"
                style={{ color: "var(--cc-text-tertiary)" }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
