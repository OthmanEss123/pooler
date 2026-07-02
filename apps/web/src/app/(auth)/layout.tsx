import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-[#0a0c10] p-4 text-slate-100 sm:p-8">
      {/* Ambient background glows */}
      <div className="absolute left-[-15%] top-[-15%] h-[60%] w-[60%] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute right-[-15%] bottom-[-15%] h-[60%] w-[60%] rounded-full bg-blue-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute left-[25%] top-[25%] h-[50%] w-[50%] rounded-full bg-purple-500/5 blur-[160px] pointer-events-none" />

      <div className="relative z-10 flex w-full flex-1 items-center justify-center py-8">
        {children}
      </div>

      <footer className="relative z-10 mt-auto flex flex-wrap items-center justify-center gap-6 py-4 text-xs text-slate-400">
        <span>&copy; 2026 Pilot Platform Limited</span>
        <Link href="#" className="transition-colors hover:text-white hover:underline">
          Privacy Policy
        </Link>
        <Link href="#" className="transition-colors hover:text-white hover:underline">
          Support
        </Link>
      </footer>
    </main>
  );
}
