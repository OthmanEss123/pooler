"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Plus, Users } from "lucide-react";
import { getMyTenants, switchTenant } from "@/lib/api/auth";
import type { TenantMembership } from "@/types/tenant";

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "P";
}

const PALETTE = [
  "from-indigo-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-rose-500 to-pink-600",
];

export default function WorkspaceSelectPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getMyTenants()
      .then((data) => {
        if (isMounted) {
          setMemberships(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Unable to load your workspaces.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSelectWorkspace(tenantId: string) {
    if (loadingId) {
      return;
    }

    setLoadingId(tenantId);
    setError(null);

    try {
      await switchTenant(tenantId);
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to open this workspace.");
      setLoadingId(null);
    }
  }

  return (
    <div className="w-full max-w-[450px]">
      <div className="mb-10 flex items-center justify-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 shadow-[0_4px_15px_rgba(99,102,241,0.3)]">
          <span className="text-base font-extrabold text-white">P</span>
        </div>
        <span className="text-xl font-extrabold tracking-tight text-white">Pilot</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[#222630]/80 bg-[#0f1115]/90 shadow-[0_24px_90px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset] backdrop-blur-md transition-all duration-300">
        <div className="px-8 py-10 sm:px-10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
            Welcome back
          </p>
          <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white leading-tight">
            Choose a workspace
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Select the workspace you want to open.
          </p>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-500/25 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          <div className="mt-8 space-y-3">
            {isLoading ? (
              <div className="flex h-28 items-center justify-center rounded-xl border border-[#22252c] bg-[#13161c]/30 text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-400" />
                Loading workspaces...
              </div>
            ) : null}

            {!isLoading && memberships.length === 0 ? (
              <div className="rounded-xl border border-[#22252c] bg-[#13161c]/30 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-white">
                  No active workspaces
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Create a workspace to continue.
                </p>
              </div>
            ) : null}

            {memberships.map((membership, index) => {
              const workspace = membership.tenant;
              const isCurrentLoading = loadingId === membership.tenantId;
              const isDisabled = loadingId !== null && !isCurrentLoading;

              return (
                <button
                  className={`group flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] ${
                    isCurrentLoading
                      ? "border-blue-500/50 bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                      : "border-[#22252c] bg-[#13161c]/50 hover:border-blue-500/40 hover:bg-[#1b1f28]/85"
                  } disabled:pointer-events-none disabled:opacity-40`}
                  disabled={isDisabled}
                  key={membership.id}
                  onClick={() => void handleSelectWorkspace(membership.tenantId)}
                  type="button"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${PALETTE[index % PALETTE.length]} text-xs font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)]`}
                  >
                    {getInitials(workspace.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-blue-400">
                      {workspace.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span className="capitalize">{membership.role.toLowerCase()}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {workspace.slug}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-slate-600 transition-colors duration-300 group-hover:text-slate-350">
                    {isCurrentLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : (
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[#1c1f26] pt-6">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#22252c] bg-[#13161c]/10 px-4 py-3 text-sm font-semibold text-slate-400 transition-all duration-300 hover:border-blue-500/40 hover:bg-[#13161c]/40 hover:text-white hover:scale-[1.01] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
              disabled={loadingId !== null}
              onClick={() => router.push("/register")}
              type="button"
            >
              <Plus className="h-4 w-4 text-blue-400" />
              Create a new workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
