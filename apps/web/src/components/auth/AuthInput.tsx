import { forwardRef, type InputHTMLAttributes } from "react";

export interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-2 text-left">
        {label && (
          <label className="text-xs font-medium text-slate-300">
            {label}
          </label>
        )}
        <input
          className={`flex h-11 w-full rounded-lg border border-slate-700/80 bg-[#1A1D24] px-3 py-2 text-sm text-white transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:border-[#2563EB] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500" : ""
          } ${className || ""}`}
          ref={ref}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
AuthInput.displayName = "AuthInput";
