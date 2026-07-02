import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "brand";

const variants: Record<BadgeVariant, string> = {
  default: "border-neutral-200 bg-neutral-50 text-neutral-700",
  success: "border-neutral-950 bg-neutral-950 text-white",
  warning: "border-neutral-300 bg-neutral-100 text-neutral-800",
  danger: "border-neutral-400 bg-white text-neutral-950",
  info: "border-neutral-300 bg-white text-neutral-700",
  neutral: "border-neutral-200 bg-white text-neutral-600",
  brand: "border-neutral-950 bg-neutral-950 text-white",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
