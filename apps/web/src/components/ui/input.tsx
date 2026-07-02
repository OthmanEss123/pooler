import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  icon?: ReactNode;
};

export function Input({ className, label, hint, icon, id, ...props }: InputProps) {
  return (
    <label className="block" htmlFor={id}>
      {label ? (
          <span className="mb-2 block text-sm font-medium text-neutral-900">
          {label}
        </span>
      ) : null}
      <span className="relative block">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            {icon}
          </span>
        ) : null}
        <input
          className={cn(
            "focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm transition placeholder:text-neutral-400 hover:border-neutral-300",
            icon ? "pl-10" : undefined,
            className,
          )}
          id={id}
          {...props}
        />
      </span>
      {hint ? <span className="mt-2 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
