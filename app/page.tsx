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
    router.push(`/results?${params.toString()}`);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
          Find <span className="text-blue-600">real prices</span> for healthcare
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Search in plain English. Compare real prices from hospitals near you.
          No insurance needed.
        </p>
      </div>

      <SearchBar onSearch={handleSearch} loading={loading} />

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900">Search in plain English</h3>
          <p className="text-sm text-gray-500 mt-1">
            Just describe what you need. We translate it to medical codes.
          </p>
        </div>
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900">Compare real prices</h3>
          <p className="text-sm text-gray-500 mt-1">
            See actual hospital prices, sourced from public data.
          </p>
        </div>
        <div className="text-center p-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900">Find nearby providers</h3>
          <p className="text-sm text-gray-500 mt-1">
            Map view shows locations and prices at a glance.
          </p>
        </div>
      </div>
    </div>
  );
}
