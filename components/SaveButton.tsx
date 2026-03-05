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

export function SaveButton({
  query,
  location,
  cptCodes,
  lat,
  lng,
}: SaveButtonProps) {
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
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-60 ${
        !saved && !saving
          ? "hover:border-[var(--cc-primary)] hover:text-[var(--cc-primary)] hover:bg-[var(--cc-primary-light)]"
          : ""
      }`}
      style={{
        background: saved ? "var(--cc-success-light)" : "transparent",
        color: saved ? "var(--cc-success)" : "var(--cc-text-secondary)",
        border: saved
          ? "1px solid rgba(5, 150, 105, 0.2)"
          : "1px solid var(--cc-border)",
      }}
    >
      {saving ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
      ) : (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
