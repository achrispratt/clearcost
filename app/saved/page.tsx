"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { SavedSearch } from "@/types";
import toast from "react-hot-toast";

export default function SavedPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setAuthenticated(false);
          setLoading(false);
          return;
        }

        setAuthenticated(true);
        const response = await fetch("/api/saved");
        if (response.ok) {
          const data = await response.json();
          setSearches(data);
        }
      } catch {
        toast.error("Failed to load saved searches");
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetch();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/saved?id=${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSearches((prev) => prev.filter((s) => s.id !== id));
        toast.success("Search removed");
      }
    } catch {
      toast.error("Failed to delete search");
    }
  };

  const handleSearchClick = (search: SavedSearch) => {
    // Use stored coordinates if available, fall back to NYC as default
    const params = new URLSearchParams({
      q: search.query,
      loc: search.location,
      lat: (search.lat ?? 40.7128).toString(),
      lng: (search.lng ?? -74.006).toString(),
    });
    router.push(`/results?${params.toString()}`);
  };

  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Saved Searches
        </h1>
        <p className="text-gray-500 mb-6">
          Sign in to save and revisit your searches.
        </p>
        <button onClick={handleSignIn} className="btn btn-primary">
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Saved Searches</h1>

      {searches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No saved searches yet.</p>
          <button
            onClick={() => router.push("/")}
            className="btn btn-primary btn-sm mt-4"
          >
            Start Searching
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {searches.map((search) => (
            <div
              key={search.id}
              className="card bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleSearchClick(search)}
            >
              <div className="card-body p-4 flex flex-row items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {search.query}
                  </h3>
                  <p className="text-sm text-gray-500">{search.location}</p>
                  <div className="flex gap-1 mt-1">
                    {search.cpt_codes.map((code) => (
                      <span
                        key={code}
                        className="badge badge-sm bg-gray-100 text-gray-600 border-none"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(search.id);
                  }}
                  className="btn btn-ghost btn-sm text-gray-400 hover:text-red-500"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
