import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

export interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export const AuthButton = forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ className, children, loading, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={loading || disabled}
        className={`inline-flex h-11 items-center justify-center rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1015] disabled:pointer-events-none disabled:opacity-50 ${className || ""}`}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
AuthButton.displayName = "AuthButton";
