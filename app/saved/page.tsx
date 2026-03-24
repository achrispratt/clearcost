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
      <div className="flex justify-center py-16">
        <svg
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--cc-primary)" }}
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{
            background: "var(--cc-primary-light)",
            color: "var(--cc-primary)",
          }}
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
        </div>
        <h1
          className="text-2xl mb-2"
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Saved Searches
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          Sign in to save and revisit your price comparisons.
        </p>
        <button
          onClick={handleSignIn}
          className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors hover:brightness-110"
          style={{ background: "var(--cc-primary)" }}
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1
        className="text-2xl mb-6"
        style={{
          fontFamily: "var(--font-fraunces), Georgia, serif",
          color: "var(--cc-text)",
        }}
      >
        Saved Searches
      </h1>

      {searches.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl border"
          style={{
            background: "var(--cc-surface)",
            borderColor: "var(--cc-border)",
          }}
        >
          <svg
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: "var(--cc-border-strong)" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
          </svg>
          <p
            className="font-medium"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            No saved searches yet
          </p>
          <p
            className="text-sm mt-1 mb-5"
            style={{ color: "var(--cc-text-tertiary)" }}
          >
            Save a search to quickly revisit it later.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:brightness-110"
            style={{ background: "var(--cc-primary)" }}
          >
            Start Searching
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {searches.map((search, i) => (
            <div
              key={search.id}
              className="card-hover rounded-xl border cursor-pointer overflow-hidden animate-fade-up"
              style={{
                background: "var(--cc-surface)",
                borderColor: "var(--cc-border)",
                animationDelay: `${i * 0.05}s`,
              }}
              onClick={() => handleSearchClick(search)}
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3
                    className="font-semibold truncate"
                    style={{ color: "var(--cc-text)" }}
                  >
                    {search.query}
                  </h3>
                  <p
                    className="text-sm mt-0.5"
                    style={{ color: "var(--cc-text-secondary)" }}
                  >
                    {search.location}
                  </p>
                  {search.cpt_codes.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {search.cpt_codes.map((code) => (
                        <span
                          key={code}
                          className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: "var(--cc-surface-alt)",
                            color: "var(--cc-text-tertiary)",
                          }}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(search.id);
                  }}
                  className="shrink-0 p-2 rounded-lg transition-colors hover:bg-[var(--cc-error-light)] hover:text-[var(--cc-error)]"
                  style={{ color: "var(--cc-text-tertiary)" }}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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
