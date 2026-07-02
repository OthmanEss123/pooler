"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  mainNavigation,
  settingsNavigation,
} from "@/components/layout/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/hooks/use-tenant";
import { cn } from "@/lib/utils";
import { getBillingUsage, type BillingUsage } from "@/lib/api/billing";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitial(name: string | undefined | null) {
  return name?.trim()[0]?.toUpperCase() ?? "P";
}

const groups = [
  {
    label: "Workspace",
    items: mainNavigation.filter((item) =>
      ["/dashboard", "/analytics", "/copilot"].includes(item.href),
    ),
  },
  {
    label: "Objects",
    items: mainNavigation.filter((item) =>
      ["/contacts", "/orders", "/products", "/segments"].includes(item.href),
    ),
  },
  {
    label: "System",
    items: mainNavigation.filter((item) => item.href === "/integrations"),
  },
  {
    label: "Admin",
    items: settingsNavigation,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const { currentTenant, isLoading } = useTenant(user?.tenantId);
  const tenantName = currentTenant?.name ?? "Pilot";
  const [billingUsage, setBillingUsage] = useState<BillingUsage | null>(null);

  useEffect(() => {
    getBillingUsage()
      .then((usage) => {
        setBillingUsage(usage);
      })
      .catch((err) => {
        console.error("Failed to load billing usage:", err);
      });
  }, []);

  const contactsLimit = billingUsage?.contacts.limit ?? 1000;
  const contactsUsed = billingUsage?.contacts.used ?? 0;
  const usagePercent = billingUsage?.contacts.percent ?? 0;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-[#F4F4F6] lg:flex">
      <div className="flex h-14 items-center border-b border-line px-3">
        <Link
          className="group flex h-10 min-w-0 flex-1 items-center justify-between rounded-lg px-2 transition hover:bg-neutral-200/50"
          href="/dashboard"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm shadow-indigo-500/20 overflow-hidden">
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : currentTenant?.logoUrl ? (
                <img src={currentTenant.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitial(tenantName)
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-bold text-neutral-950">
                {isLoading ? "Loading..." : tenantName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500 transition group-hover:text-neutral-800" />
            </span>
          </span>
          <BriefcaseBusiness className="h-4 w-4 shrink-0 text-neutral-500 transition group-hover:text-neutral-800" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                {group.label}
              </p>
              <div className="mt-2 space-y-0.5">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      className={cn(
                        "group flex h-9 items-center justify-between rounded-md px-2.5 text-sm font-medium transition",
                        active
                          ? "bg-neutral-200/80 text-neutral-900 font-semibold"
                          : "text-neutral-600 hover:bg-neutral-200/40 hover:text-neutral-900",
                      )}
                      href={item.href}
                      key={item.name}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-neutral-900" : "text-neutral-500",
                          )}
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      {active ? <ChevronRight className="h-3.5 w-3.5" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-neutral-700">
              {billingUsage ? `${billingUsage.plan} Plan` : "Usage"}
            </p>
            <p className="text-[10px] font-semibold text-ink">
              {contactsUsed} / {contactsLimit}
            </p>
          </div>
          <div className="mt-2.5 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-brand-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
