"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { checkEmail } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid work email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { exists } = await checkEmail(email.trim());
      window.sessionStorage.setItem("authEmail", email.trim());
      window.sessionStorage.setItem("authEmailExists", JSON.stringify(exists));
      await new Promise((resolve) => setTimeout(resolve, 350));
      router.push("/login/verify");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Backend API is not reachable. Start the backend on localhost:3000, then try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[1100px] overflow-hidden rounded-3xl border border-[#222630]/80 bg-[#0f1115]/90 shadow-[0_24px_90px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset] backdrop-blur-md transition-all duration-300">
      <div className="grid min-h-[690px] grid-cols-1 md:grid-cols-2">
        <section className="flex flex-col justify-center border-b border-[#1c1f26] px-8 py-12 sm:px-20 md:border-b-0 md:border-r">
          <div className="mx-auto w-full max-w-[372px]">
            
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold tracking-tight text-white">Sign in</h1>
              <p className="mt-2 text-sm text-slate-400">Welcome to your commerce intelligence portal.</p>
            </div>

            <GoogleButton className="w-full h-11 border border-[#22252c] bg-[#161920] text-sm text-slate-200 transition-all duration-300 hover:bg-[#1b1f28] hover:text-white hover:scale-[1.01] active:scale-[0.99] rounded-xl flex items-center justify-center gap-2">
              Sign in with Google
            </GoogleButton>

            <div className="relative my-8 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1c1f26]" /></div>
              <span className="relative bg-[#0f1115] px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">or</span>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="flex h-11 items-center rounded-xl border border-[#22252c] bg-[#13161c] px-3.5 transition-all duration-300 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/10 focus-within:shadow-[0_0_12px_rgba(59,130,246,0.15)] group">
                <Mail className="mr-2.5 h-4 w-4 shrink-0 text-slate-500 transition-colors duration-300 group-focus-within:text-blue-400" />
                <input
                  autoComplete="email"
                  autoFocus
                  className="h-full w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500 disabled:opacity-50"
                  disabled={isSubmitting}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your work email address"
                  type="email"
                  value={email}
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-red-500/25 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-300 transition-all">
                  {error}
                </div>
              ) : null}

              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-sm font-bold text-white transition-all duration-300 transform hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(99,102,241,0.3)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:scale-100 disabled:shadow-none"
                disabled={isSubmitting || !email.trim()}
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Continue"
                )}
              </button>
            </form>

            <p className="mt-40 text-[10px] leading-relaxed text-slate-400 sm:mt-32">
              By inserting your email you confirm you agree to Pilot contacting
              you about our product and services. You can opt out at any time.
              Find out more about how we use data in our privacy policy.
            </p>
          </div>
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
