"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";
import { verifyMfa } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

export function MfaForm() {
  const router = useRouter();
  const [mfaTempToken, setMfaTempToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setMfaTempToken(window.sessionStorage.getItem("mfaTempToken") ?? "");
  }, []);

  useEffect(() => {
    if (mfaTempToken && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [mfaTempToken]);

  const handleChange = (index: number, value: string) => {
    // Only allow numbers
    if (!/^[0-9]*$/.test(value)) return;

    const newCode = [...code];
    // Take the last character if multiple are entered
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError(null);

    // Auto focus next input
    if (value !== "" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(pastedData)) return;

    const digits = pastedData.split("");
    setCode(digits);
    setError(null);

    // Focus last input
    inputRefs.current[5]?.focus();
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const totpCode = code.join("");
    if (totpCode.length !== 6) {
      setError("Please enter the full 6-digit code.");
      setIsSubmitting(false);
      return;
    }

    try {
      await verifyMfa({
        mfaTempToken,
        totpCode,
      });
      window.sessionStorage.removeItem("mfaTempToken");
      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : "Unable to verify this code. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-neutral-850 bg-neutral-900/60 p-8 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:p-10 text-center flex flex-col items-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-6">
        <ShieldCheck className="h-6 w-6" />
      </span>

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          Verify your identity
        </h1>
        <p className="mt-1.5 text-xs text-neutral-400 max-w-[280px] mx-auto">
          Enter the 6-digit verification code from your authenticator app.
        </p>
      </div>

      <form className="mt-8 w-full" onSubmit={onSubmit}>
        <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={isSubmitting || !mfaTempToken}
              className="h-12 w-12 rounded-lg border border-neutral-800 bg-neutral-950/80 text-center text-lg font-bold text-white transition-all duration-150 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          ))}
        </div>

        {!mfaTempToken ? (
          <div className="rounded-lg border border-yellow-500/25 bg-yellow-950/15 p-3 text-xs text-yellow-400 text-left mb-6">
            Please log in with your email and password first before entering a verification code.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/25 bg-red-950/15 p-3 text-xs text-red-400 text-left mb-6 w-full">
            {error}
          </div>
        ) : null}

        <button
          disabled={isSubmitting || !mfaTempToken || code.join("").length !== 6}
          type="submit"
          className="h-11 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(99,102,241,0.25)] transition-all hover:from-indigo-500 hover:to-violet-500 hover:shadow-[0_4px_25px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            "Verify code"
          )}
        </button>
      </form>

      <Link
        className="mt-8 block text-xs font-semibold text-neutral-400 hover:text-white hover:underline transition-colors"
        href="/login"
      >
        Back to login
      </Link>
    </div>
  );
}

