"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

interface SaveButtonProps {
  query: string;
  location: string;
  cptCodes: string[];
  lat?: number;
  lng?: number;
}

export function SaveButton({ query, location, cptCodes, lat, lng }: SaveButtonProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Sign in to save searches");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, location, cptCodes, lat, lng }),
      });

      if (!response.ok) throw new Error("Failed to save");

      setSaved(true);
      toast.success("Search saved!");
    } catch {
      toast.error("Failed to save search");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={handleSave}
      disabled={saving || saved}
      className={`btn btn-sm ${
        saved
          ? "btn-success"
          : "btn-outline border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600"
      }`}
    >
      {saving ? (
        <span className="loading loading-spinner loading-xs" />
      ) : saved ? (
        "Saved"
      ) : (
        <>
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
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          Save
        </>
      )}
    </button>
  );
}
