"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      setConfigured(true);

      const getUser = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
        setLoading(false);
      };
      getUser();

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = () => setOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  const handleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setOpen(false);
  };

  if (loading) {
    return <div className="w-8 h-8" />;
  }

  if (!configured) {
    return null;
  }

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-opacity hover:opacity-80"
          style={{
            background: "var(--cc-primary-muted)",
            color: "var(--cc-primary)",
          }}
        >
          {user.email?.[0]?.toUpperCase()}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-56 rounded-xl border p-1.5 shadow-lg animate-slide-down"
            style={{
              background: "var(--cc-surface)",
              borderColor: "var(--cc-border)",
            }}
          >
            <div
              className="px-3 py-2 text-xs truncate"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              {user.email}
            </div>
            <Link
              href="/saved"
              className="block px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--cc-surface-alt)]"
              style={{ color: "var(--cc-text)" }}
              onClick={() => setOpen(false)}
            >
              Saved Searches
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-[var(--cc-surface-alt)]"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
      style={{ background: "var(--cc-primary)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--cc-primary-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--cc-primary)";
      }}
    >
      Sign In
    </button>
  );
}
