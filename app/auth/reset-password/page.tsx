"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

type Mode = "request" | "sent" | "recovery";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "recovery" ? "recovery" : "request"
  );
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password?mode=recovery")}`,
      }
    );
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMode("sent");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    toast.success("Password updated successfully");
    router.push("/");
  };

  // State 2: Set new password (after clicking email link)
  if (mode === "recovery") {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <h1
            className="text-2xl sm:text-3xl font-semibold text-center mb-8"
            style={{
              fontFamily: "var(--font-instrument-serif), Georgia, serif",
              color: "var(--cc-text)",
            }}
          >
            Set new password
          </h1>

          <div
            className="rounded-xl border p-6 sm:p-8"
            style={{
              background: "var(--cc-surface)",
              borderColor: "var(--cc-border)",
            }}
          >
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  New password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cc-primary)] transition-shadow"
                  style={{
                    borderColor: "var(--cc-border)",
                    background: "var(--cc-surface)",
                    color: "var(--cc-text)",
                  }}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--cc-text-secondary)" }}
                >
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cc-primary)] transition-shadow"
                  style={{
                    borderColor: "var(--cc-border)",
                    background: "var(--cc-surface)",
                    color: "var(--cc-text)",
                  }}
                  placeholder="Confirm your new password"
                  autoComplete="new-password"
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
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // State 1b: Email sent confirmation
  if (mode === "sent") {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div
            className="rounded-xl border p-8"
            style={{
              background: "var(--cc-success-light)",
              borderColor: "rgba(5, 150, 105, 0.15)",
            }}
          >
            <h2
              className="text-xl font-semibold mb-3"
              style={{
                fontFamily: "var(--font-instrument-serif), Georgia, serif",
                color: "var(--cc-text)",
              }}
            >
              Check your email
            </h2>
            <p
              className="text-sm"
              style={{ color: "var(--cc-text-secondary)" }}
            >
              We sent a password reset link to{" "}
              <span className="font-medium" style={{ color: "var(--cc-text)" }}>
                {email}
              </span>
              . Click the link to set a new password.
            </p>
          </div>
          <p
            className="mt-6 text-sm"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            <Link
              href="/auth/signin"
              className="font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--cc-primary)" }}
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // State 1: Request password reset
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-center mb-8"
          style={{
            fontFamily: "var(--font-instrument-serif), Georgia, serif",
            color: "var(--cc-text)",
          }}
        >
          Reset your password
        </h1>

        <div
          className="rounded-xl border p-6 sm:p-8"
          style={{
            background: "var(--cc-surface)",
            borderColor: "var(--cc-border)",
          }}
        >
          <p
            className="text-sm mb-5"
            style={{ color: "var(--cc-text-secondary)" }}
          >
            Enter your email and we&apos;ll send you a link to reset your
            password.
          </p>

          <form onSubmit={handleRequestReset} className="space-y-4">
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
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        </div>

        <p
          className="mt-6 text-center text-sm"
          style={{ color: "var(--cc-text-secondary)" }}
        >
          <Link
            href="/auth/signin"
            className="font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--cc-primary)" }}
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
