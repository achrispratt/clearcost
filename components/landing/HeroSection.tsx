"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/SearchBar";
import { ExampleAnswer } from "./ExampleAnswer";

const SUGGESTIONS = [
  "Knee MRI",
  "Colonoscopy",
  "Mammogram",
  "Blood work",
  "Hip replacement",
];

export function HeroSection({ preset }: { preset?: string }) {
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
    <section
      id="ask"
      className="scroll-mt-16 px-4 lg:px-6 pt-10 pb-16 sm:pt-16 lg:pt-20 lg:pb-24"
    >
      <div className="max-w-[1120px] mx-auto grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 items-start">
        <div className="min-w-0 animate-fade-up">
          <h1
            className="text-[44px] sm:text-[56px] lg:text-[64px] leading-[1.02] tracking-[-0.01em]"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            What do you need priced?
          </h1>
          <p
            className="mt-4 mb-8 text-[17px] sm:text-[19px] leading-relaxed max-w-[34rem]"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Ask the way you&rsquo;d ask a friend. We&rsquo;ll work out the exact
            procedure with a couple of quick questions, then show what hospitals
            near you charge, cash and insured.
          </p>
          <SearchBar
            key={preset}
            initialQuery={preset}
            onSearch={handleSearch}
            suggestions={SUGGESTIONS}
          />
          <p
            className="mt-6 text-[13px]"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            Free. No account needed. Works without insurance.
          </p>
        </div>

        <div
          className="min-w-0 animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          <ExampleAnswer />
        </div>
      </div>
    </section>
  );
}
