"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";

export default function Home() {
  const router = useRouter();
  const [loading] = useState(false);

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
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24 relative hero-gradient">
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
            Compare real hospital prices across 5,200+ providers.
            Search in plain English. No insurance required.
          </p>

          {/* Search Bar */}
          <div
            className="w-full animate-fade-up"
            style={{ animationDelay: "0.24s" }}
          >
            <SearchBar onSearch={handleSearch} loading={loading} />
          </div>

          {/* Stats Row */}
          <div
            className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 mt-10 animate-fade-up"
            style={{ animationDelay: "0.32s" }}
          >
            {[
              { value: "5,200+", label: "hospitals" },
              { value: "12.5M", label: "prices" },
              { value: "1,010", label: "procedures" },
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

      {/* How It Works Section */}
      <div
        className="border-t px-4 py-16 sm:py-20"
        style={{
          borderColor: "var(--cc-border)",
          background: "var(--cc-surface)",
        }}
      >
        <div className="max-w-4xl mx-auto">
          <h2
            className="text-center text-sm font-semibold tracking-widest uppercase mb-12"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            How It Works
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12">
            {[
              {
                num: "01",
                title: "Search in plain English",
                desc: "Describe what you need. Our AI translates it into the exact billing codes hospitals use.",
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                ),
              },
              {
                num: "02",
                title: "Compare real prices",
                desc: "See actual cash prices from hospital pricing data, mandated by federal law since 2021.",
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                ),
              },
              {
                num: "03",
                title: "Find nearby providers",
                desc: "Map and list views help you find the best price at a convenient location near you.",
                icon: (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                ),
              },
            ].map((step, i) => (
              <div key={i} className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: "var(--cc-primary-light)",
                      color: "var(--cc-primary)",
                    }}
                  >
                    {step.icon}
                  </div>
                  <span
                    className="text-3xl font-light"
                    style={{
                      fontFamily: "var(--font-instrument-serif), Georgia, serif",
                      color: "var(--cc-border-strong)",
                    }}
                  >
                    {step.num}
                  </span>
                </div>
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "var(--cc-text)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="border-t px-4 py-6 text-center text-xs"
        style={{
          borderColor: "var(--cc-border)",
          color: "var(--cc-text-tertiary)",
        }}
      >
        Data sourced from hospital Machine Readable Files (MRFs) as required by CMS.
        Prices shown are self-pay / cash rates and may not reflect your final cost.
      </div>
    </div>
  );
}
