"use client";

import { useState } from "react";
import { LocationInput } from "./LocationInput";

interface SearchBarProps {
  onSearch: (
    query: string,
    location: { lat: number; lng: number; display: string }
  ) => void;
  loading?: boolean;
  initialQuery?: string;
}

const placeholders = [
  "I need a knee MRI",
  "How much is a colonoscopy?",
  "Blood work for cholesterol",
  "Chest X-ray near me",
];

export function SearchBar({
  onSearch,
  loading,
  initialQuery = "",
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    display: string;
  } | null>(null);

  const [placeholder] = useState(
    placeholders[Math.floor(Math.random() * placeholders.length)]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && location) {
      onSearch(query.trim(), location);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="input input-bordered w-full bg-white text-gray-900 border-gray-300 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="sm:w-64">
          <LocationInput onLocationSelect={setLocation} />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || !location || loading}
          className="btn btn-primary"
        >
          {loading ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Search"
          )}
        </button>
      </div>
    </form>
  );
}
