"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/client/auth-context";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setAuth } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { token } = await login({ username, password });
      console.log("[LoginPage] ✅ Login successful for user:", username);
      
      // Wait for auth to be saved before redirecting
      await setAuth(token, username);
      console.log("[LoginPage] ✅ Auth saved, redirecting to chat...");
      
      router.push("/chat");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      console.error("[LoginPage] ❌ Login error:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#dce9e7] dark:bg-gray-950 px-4 py-8">
      <div className="login-bg-shape login-bg-shape-left" />
      <div className="login-bg-shape login-bg-shape-right" />

      <div className="w-full max-w-md animate-login-card-enter">
        <div className="relative rounded-3xl bg-[#f3f5f5] dark:bg-gray-900 p-6 shadow-[0_18px_36px_-24px_rgba(0,0,0,0.28)] md:p-7">
          <Link
            href="/landing"
            aria-label="Close login"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 dark:text-gray-400 transition-colors hover:bg-slate-200/80 hover:text-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>

          <div className="mb-8 text-center">
            <div className="inline-flex h-14 w-14 animate-soft-pop items-center justify-center rounded-full bg-[#dff6f0] dark:bg-[#13C9A0]/20">
              <svg className="h-6 w-6 text-[#13C9A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white md:text-4xl">Welcome back</h1>
            <p className="mt-2 text-base text-slate-500 dark:text-gray-400">Sign in to your account</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="mb-2 block text-base font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-[#c7ced8] dark:border-gray-700 bg-[#d9e3f0] dark:bg-gray-800 px-4 py-3 text-base text-slate-900 dark:text-white outline-none transition-shadow placeholder:text-slate-500 dark:text-gray-400 focus:ring-2 focus:ring-[#13C9A0]/35"
                placeholder="Username"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="block text-base font-medium text-slate-700">
                  Password
                </label>
                <Link href="/forgot-password" className="text-lg font-medium text-[#13C9A0] transition-colors hover:text-[#0faa87]">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#c7ced8] dark:border-gray-700 bg-[#d9e3f0] dark:bg-gray-800 px-4 py-3 text-base tracking-wide text-slate-900 dark:text-white outline-none transition-shadow placeholder:text-slate-500 dark:text-gray-400 focus:ring-2 focus:ring-[#13C9A0]/35"
                placeholder="Password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-xl bg-[#13C9A0] px-4 py-3 text-base font-medium text-white transition duration-200 hover:bg-[#10b48f] hover:shadow-[0_10px_20px_-12px_rgba(16,180,143,0.9)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-base text-slate-500 dark:text-gray-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-[#13C9A0] transition-colors hover:text-[#0faa87]">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
