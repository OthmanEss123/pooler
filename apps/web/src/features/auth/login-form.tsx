"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockKeyhole, Mail, Loader2 } from "lucide-react";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await login({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });

      if ("requiresMfa" in result && result.requiresMfa) {
        window.sessionStorage.setItem("mfaTempToken", result.mfaTempToken);
        router.push("/mfa");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Unable to sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-neutral-850 bg-neutral-900/60 p-8 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-10">
      <div>
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
          Welcome back
        </p>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
          Sign in to Pilot
        </h1>
        <p className="mt-1 text-xs text-neutral-400">
          Use your workspace account to continue to your dashboard.
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <div className="space-y-1.5 text-left">
          <label htmlFor="email" className="block text-xs font-semibold text-neutral-300">
            Email Address
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
              <Mail className="h-4 w-4" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              autoComplete="email"
              disabled={isSubmitting}
              className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 pl-10 pr-4 text-sm text-white placeholder-neutral-500 transition-all duration-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="space-y-1.5 text-left">
          <label htmlFor="password" className="block text-xs font-semibold text-neutral-300">
            Password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={isSubmitting}
              className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 pl-10 pr-4 text-sm text-white placeholder-neutral-500 transition-all duration-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-500/25 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-400">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between text-xs font-semibold">
          <label className="flex items-center gap-2 text-neutral-400 hover:text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-800 bg-neutral-950 text-indigo-600 focus:ring-offset-0 focus:ring-indigo-500/20"
            />
            <span>Remember me</span>
          </label>
          <Link
            className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
            href="/mfa"
          >
            Use MFA code
          </Link>
        </div>

        <button
          disabled={isSubmitting}
          type="submit"
          className="h-11 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-[0_4px_25px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-neutral-400">
        New to Pilot?{" "}
        <Link
          className="font-bold text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
          href="/register"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

