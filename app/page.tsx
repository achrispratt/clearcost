import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { WhyClearCost } from "@/components/landing/WhyClearCost";
import { DataQuality } from "@/components/landing/DataQuality";
import { SearchCategories } from "@/components/landing/SearchCategories";

export default function Home() {
  return (
    <>
      <HeroSection />
      <HowItWorks />
      <WhyClearCost />
      <DataQuality />
      <SearchCategories />
    </>
  );
}
