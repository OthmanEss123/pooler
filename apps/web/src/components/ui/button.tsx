import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-600",
  secondary:
    "border border-line bg-white text-ink shadow-sm hover:border-neutral-300 hover:bg-neutral-50",
  ghost: "text-neutral-700 hover:bg-neutral-100 hover:text-ink",
  danger:
    "border border-neutral-300 bg-white text-ink hover:border-black hover:bg-neutral-100",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  icon,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-md font-medium transition disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      type={type}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
