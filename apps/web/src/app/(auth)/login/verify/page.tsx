"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [exists, setExists] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("authEmail") ?? "";
    const storedExists = window.sessionStorage.getItem("authEmailExists") === "true";
    setEmail(stored);
    setExists(storedExists);
    if (!stored) {
      router.replace("/login");
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(
        exists
          ? "The password must be at least 8 characters."
          : "The temporary password must be at least 8 characters."
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (exists) {
        const res = await login({ email, password });

        if ("requiresMfa" in res && res.requiresMfa) {
          window.sessionStorage.setItem("mfaTempToken", res.mfaTempToken);
          router.push("/mfa");
          return;
        }

        window.sessionStorage.removeItem("authEmail");
        window.sessionStorage.removeItem("authPassword");
        window.sessionStorage.removeItem("authEmailExists");
        router.push("/workspace/select");
        router.refresh();
      } else {
        window.sessionStorage.setItem("authPassword", password);
        await new Promise((resolve) => setTimeout(resolve, 300));
        router.push("/login/setup");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Incorrect password. Please try again.");
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Incorrect password or unable to continue. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[1100px] overflow-hidden rounded-3xl border border-[#222630]/80 bg-[#0f1115]/90 shadow-[0_24px_90px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset] backdrop-blur-md transition-all duration-300">
      <div className="grid min-h-[690px] grid-cols-1 md:grid-cols-2">
        <section className="flex flex-col justify-center border-b border-[#1c1f26] px-8 py-12 sm:px-20 md:border-b-0 md:border-r">
          <form className="mx-auto w-full max-w-[372px]" onSubmit={onSubmit}>
            
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                {exists ? "Welcome back!" : "Check your inbox!"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {exists ? (
                  "Please enter your password to log in."
                ) : (
                  <>
                    We have just emailed you a temporary password.
                    <br />
                    Please enter it below.
                  </>
                )}
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex h-11 items-center rounded-xl border border-[#1a1c22] bg-[#111318]/50 px-3.5">
                <Mail className="mr-2.5 h-4 w-4 shrink-0 text-slate-600" />
                <input
                  className="h-full w-full bg-transparent text-sm font-semibold text-slate-500 outline-none"
                  disabled
                  type="email"
                  value={email}
                />
              </div>

              <div className="flex h-11 items-center rounded-xl border border-[#22252c] bg-[#13161c] px-3.5 transition-all duration-300 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:shadow-[0_0_12px_rgba(59,130,246,0.15)] group">
                <KeyRound className="mr-2.5 h-4 w-4 shrink-0 text-slate-500 transition-colors duration-300 group-focus-within:text-blue-400" />
                <input
                  autoComplete={exists ? "current-password" : "new-password"}
                  autoFocus
                  className="h-full w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
                  disabled={isSubmitting}
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={exists ? "Enter password..." : "Enter temporary password..."}
                  type="password"
                  value={password}
                />
              </div>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-300 transition-all">
                {error}
              </div>
            ) : null}

            <button
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-bold text-white transition-all duration-300 transform hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(99,102,241,0.3)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:scale-100 disabled:shadow-none"
              disabled={isSubmitting || password.length < 8}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                "Continue"
              )}
            </button>

            <Link
              className="mt-6 block text-center text-xs font-semibold text-slate-500 transition hover:text-white hover:underline"
              href="/login"
            >
              Use a different email
            </Link>
          </form>
        </section>

        <aside className="relative hidden items-center overflow-hidden bg-gradient-to-br from-[#12151b] to-[#0d0f12] px-[72px] md:flex border-l border-[#1c1f26]">
          {/* Inner ambient glows */}
          <div className="absolute top-[20%] right-[-20%] h-[300px] w-[300px] rounded-full bg-blue-500/5 blur-[80px] pointer-events-none" />
          <div className="absolute bottom-[20%] left-[-20%] h-[300px] w-[300px] rounded-full bg-indigo-500/5 blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 max-w-[420px]">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#78a7ff] mb-6">
              <span className="h-1 w-1 rounded-full bg-blue-400 animate-ping" />
              Introducing Pilot v2
            </div>
            
            <h2 className="text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
              Welcome to <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-indigo-400 bg-clip-text text-transparent">Pilot</span>.
            </h2>
            <p className="mt-5 text-sm font-medium leading-relaxed text-slate-300">
              Pilot is a radically new type of commerce intelligence. Built on
              an entirely new type of data architecture, you will have profiles
              and records of every interaction within your network in minutes,
              always updated in real-time.
            </p>
            <p className="mt-5 text-sm font-medium leading-relaxed text-slate-300">
              You will be able to customize and create your workspace exactly as
              you want it.
            </p>
            <p className="mt-6 text-sm font-semibold text-blue-400">
              Let&apos;s begin.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
