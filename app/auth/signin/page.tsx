"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (authError) {
      if (authError.message.includes("Email not confirmed")) {
        setError(
          "Please confirm your email before signing in. Check your inbox."
        );
      } else if (authError.message.includes("Invalid login credentials")) {
        setError("Invalid email or password");
      } else {
        setError(authError.message);
      }
      return;
    }

    router.push(next);
  };

  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-center mb-8"
          style={{
            fontFamily: "var(--font-fraunces), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Sign in to ClearCost
        </h1>

        <div
          className="rounded-xl border p-6 sm:p-8"
          style={{
            background: "var(--cc-surface)",
            borderColor: "var(--cc-border)",
          }}
        >
          {/* Google OAuth */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[var(--cc-surface-alt)]"
            style={{
              borderColor: "var(--cc-border)",
              color: "var(--cc-text)",
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div
              className="flex-1 h-px"
              style={{ background: "var(--cc-border)" }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--cc-text-tertiary)" }}
            >
              or
            </span>
            <div
              className="flex-1 h-px"
              style={{ background: "var(--cc-border)" }}
            />
          </div>

          {/* Email Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cc-primary)] transition-shadow"
                style={{
                  borderColor: "var(--cc-border)",
                  background: "var(--cc-surface)",
                  color: "var(--cc-text)",
                }}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--cc-text-secondary)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cc-primary)] transition-shadow"
                style={{
                  borderColor: "var(--cc-border)",
                  background: "var(--cc-surface)",
                  color: "var(--cc-text)",
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                className="p-3 rounded-lg border text-sm"
                style={{
                  background: "var(--cc-error-light)",
                  borderColor: "rgba(220, 38, 38, 0.15)",
                  color: "var(--cc-error)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors hover:bg-[var(--cc-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--cc-primary)" }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/auth/reset-password"
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--cc-primary)" }}
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p
          className="mt-6 text-center text-sm"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--cc-primary)" }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
