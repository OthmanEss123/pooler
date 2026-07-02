import type { ReactNode } from "react";

interface AuthCardProps {
  children: ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div
      className={`w-full rounded-2xl border border-slate-800/80 bg-[#13161B]/80 p-8 backdrop-blur-xl shadow-[0_16px_70px_rgb(0,0,0,0.5)] sm:p-12 ${
        className || "max-w-[440px]"
      }`}
    >
      {children}
    </div>
  );
}
