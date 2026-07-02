"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail, User, LockKeyhole, Loader2, Compass } from "lucide-react";
import { register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("inviteToken") ?? undefined;
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const suggestedSlug = useMemo(() => slugify(company), [company]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("name") ?? "").trim();
    const [firstName, ...lastNameParts] = fullName.split(/\s+/);
    const tenantName = String(formData.get("tenantName") ?? "");
    const tenantSlug = String(formData.get("tenantSlug") ?? suggestedSlug);

    try {
      await register({
        tenantName,
        tenantSlug,
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        firstName: firstName || undefined,
        lastName: lastNameParts.join(" ") || undefined,
        inviteToken,
      });

      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Unable to create the workspace. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[880px] rounded-2xl border border-neutral-850 bg-neutral-900/60 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
        {/* Left Column: Form Controls */}
        <div className="p-8 sm:p-10 md:col-span-7 flex flex-col justify-center border-b border-neutral-800 md:border-b-0 md:border-r">
          <div>
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
              Start your workspace
            </p>
            <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
              Create your account
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Connect your data stack and unify customer interactions in real-time.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Company Field */}
              <div className="space-y-1.5 text-left col-span-1">
                <label htmlFor="tenantName" className="block text-xs font-semibold text-neutral-300">
                  Company Name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <input
                    id="tenantName"
                    name="tenantName"
                    type="text"
                    required={!inviteToken}
                    placeholder="Acme Corp"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 pl-10 pr-4 text-sm text-white placeholder-neutral-500 transition-all duration-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Workspace Slug Field */}
              <div className="space-y-1.5 text-left col-span-1">
                <label htmlFor="tenantSlug" className="block text-xs font-semibold text-neutral-300">
                  Workspace Slug
                </label>
                <input
                  id="tenantSlug"
                  name="tenantSlug"
                  type="text"
                  readOnly
                  required={!inviteToken}
                  placeholder="acme-corp"
                  value={suggestedSlug}
                  className="h-11 w-full rounded-lg border border-neutral-800/50 bg-neutral-950/40 px-3.5 text-sm text-neutral-400 outline-none select-none cursor-not-allowed"
                />
              </div>
            </div>

            {/* Full Name Field */}
            <div className="space-y-1.5 text-left">
              <label htmlFor="name" className="block text-xs font-semibold text-neutral-300">
                Full Name
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500">
                  <User className="h-4 w-4" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Alex Morgan"
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 pl-10 pr-4 text-sm text-white placeholder-neutral-500 transition-all duration-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Email Field */}
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
                  placeholder="alex@company.com"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-lg border border-neutral-800 bg-neutral-950/80 pl-10 pr-4 text-sm text-white placeholder-neutral-500 transition-all duration-200 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password Field */}
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
                  minLength={8}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
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

            <button
              disabled={isSubmitting}
              type="submit"
              className="h-11 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-[0_4px_25px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating Workspace...</span>
                </>
              ) : (
                "Create workspace"
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-neutral-400">
            Already have an account?{" "}
            <Link
              className="font-bold text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
              href="/login"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Right Column: Info Panel */}
        <div className="p-8 sm:p-10 md:col-span-5 flex flex-col justify-center bg-indigo-950/20 backdrop-blur-sm relative overflow-hidden text-left">
          {/* Glowing blobs inside panel */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative space-y-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Compass className="h-5 w-5" />
            </span>
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                Real-time Customer Intelligence
              </h2>
              <p className="text-xs leading-5 text-neutral-400">
                Pilot provides a unified layer for ecommerce analytics. We synthesize customer sessions, orders, and campaigns into a queryable graph in minutes.
              </p>
            </div>
            <div className="border-t border-neutral-850 my-2" />
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-none mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                <p className="text-xs text-neutral-400 leading-tight">Instant sync from Stripe, Shopify, & Segment</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-none mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                <p className="text-xs text-neutral-400 leading-tight">Developer API and raw SQL console access</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-none mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />
                <p className="text-xs text-neutral-400 leading-tight">Automated multi-channel audience segments</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

