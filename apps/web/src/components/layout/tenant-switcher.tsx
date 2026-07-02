"use client";

import { useState, useRef, useEffect } from "react";
import { Store, ChevronDown, Check, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/utils";

export function TenantSwitcher() {
  const { user } = useCurrentUser();
  const { memberships, currentTenant, isLoading, switchTenant } = useTenant(
    user?.tenantId,
  );
  
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectTenant = async (tenantId: string) => {
    setIsOpen(false);
    await switchTenant(tenantId);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          "focus-ring flex h-9 items-center gap-2 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-left text-sm shadow-sm transition-all duration-200 select-none hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98]",
          isLoading && "opacity-75 cursor-not-allowed",
          isOpen && "border-neutral-900 bg-neutral-50"
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-indigo-50 border border-indigo-100 text-indigo-600 transition-colors">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Store className="h-3 w-3" />
          )}
        </span>
        
        <div className="flex flex-col min-w-0 max-w-[120px] sm:max-w-[160px]">
          <span className="block text-[10px] font-semibold text-neutral-400 uppercase tracking-tight leading-none mb-0.5">
            Tenant
          </span>
          <span className="block truncate text-xs font-semibold text-neutral-800 leading-none">
            {isLoading ? "Loading..." : currentTenant?.name ?? "No tenant"}
          </span>
        </div>

        <ChevronDown 
          className={cn(
            "h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ease-out ml-1",
            isOpen && "rotate-180 text-neutral-700"
          )} 
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-60 origin-top-left rounded-xl border border-neutral-200/80 bg-white/95 backdrop-blur-md p-1.5 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-100">
          <div className="px-2.5 py-1.5">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Switch Tenant
            </p>
          </div>
          <div className="mt-1 space-y-0.5 max-h-60 overflow-y-auto">
            {memberships.length > 0 ? (
              memberships.map((membership) => {
                const isSelected = currentTenant?.id === membership.tenantId;
                return (
                  <button
                    key={membership.tenantId}
                    onClick={() => handleSelectTenant(membership.tenantId)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150",
                      isSelected 
                        ? "bg-neutral-50 font-semibold text-neutral-900" 
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950 active:bg-neutral-100"
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-100 text-neutral-500",
                        isSelected && "bg-indigo-50 text-indigo-600"
                      )}>
                        <Store className="h-3 w-3" />
                      </span>
                      <span className="truncate">{membership.tenant.name}</span>
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-indigo-600" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-2.5 py-3 text-center text-xs text-neutral-400">
                No active memberships
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

