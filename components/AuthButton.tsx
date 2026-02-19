"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

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
  };

  if (loading) {
    return <div className="w-8 h-8" />;
  }

  if (!configured) {
    return null;
  }

  if (user) {
    return (
      <div className="dropdown dropdown-end">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-circle avatar placeholder"
        >
          <div className="bg-blue-100 text-blue-600 rounded-full w-8">
            <span className="text-sm">
              {user.email?.[0]?.toUpperCase()}
            </span>
          </div>
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content menu bg-white rounded-box z-10 w-52 p-2 shadow-lg border border-gray-200"
        >
          <li className="menu-title text-xs text-gray-500 px-2">
            {user.email}
          </li>
          <li>
            <Link href="/saved">Saved Searches</Link>
          </li>
          <li>
            <button onClick={handleSignOut}>Sign Out</button>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <button onClick={handleSignIn} className="btn btn-primary btn-sm">
      Sign In
    </button>
  );
}
