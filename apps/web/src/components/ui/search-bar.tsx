"use client";

import type { InputHTMLAttributes } from "react";
import { Search, Command } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchBarProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  placeholder?: string;
  className?: string;
};

export function SearchBar({
  placeholder = "Search customers, orders, campaigns...",
  className,
  ...props
}: SearchBarProps) {
  return (
    <label className={cn("relative block w-full max-w-xl group", className)}>
      <span className="sr-only">{placeholder}</span>
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
        <Search className="h-4 w-4 text-neutral-400 transition-colors duration-200 group-focus-within:text-neutral-700" />
      </div>
      <input
        className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50/50 backdrop-blur-md pl-10 pr-4 text-sm text-neutral-900 transition-all duration-200 placeholder:text-neutral-400/80 outline-none hover:bg-neutral-50 focus:bg-white focus:border-neutral-900 focus:ring-4 focus:ring-neutral-900/5 shadow-sm"
        placeholder={placeholder}
        type="search"
        {...props}
      />
    </label>
  );
}


