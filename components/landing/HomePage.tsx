"use client";

import { useState } from "react";
import { HeroSection } from "./HeroSection";
import { HowItWorks } from "./HowItWorks";
import { WhatYouCanSearch } from "./WhatYouCanSearch";
import { HonestData } from "./HonestData";

export function HomePage() {
  const [preset, setPreset] = useState<string>();

  const ask = (query: string) => {
    setPreset(query);
    document.getElementById("ask")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <HeroSection preset={preset} />
      <HowItWorks />
      <WhatYouCanSearch onPick={ask} />
      <HonestData />
    </>
  );
}
