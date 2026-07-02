"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, User, LogOut, Settings, ChevronDown, Command } from "lucide-react";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { mainNavigation } from "@/components/layout/navigation";
import { SearchBar } from "@/components/ui/search-bar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Topbar() {
  const pathname = usePathname();
  const { user, isLoading, logout } = useCurrentUser();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const displayName =
    user?.firstName || user?.email?.split("@")[0] || (isLoading ? "..." : "Guest");

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileOpen]);

  const handleProfileOptionClick = () => {
    setIsProfileOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200/60 bg-white/70 backdrop-blur-md transition-all duration-200">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-2 lg:hidden" href="/dashboard">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold text-white shadow-md">
            P
          </span>
          <span className="hidden text-sm font-semibold text-neutral-800 sm:inline">
            Pilot
          </span>
        </Link>

        {/* Search Bar Container */}
        <div className="hidden max-w-xl flex-1 items-center gap-2 md:flex">
          <SearchBar className="flex-1" placeholder="Search records, campaigns, orders..." />
          <kbd className="hidden h-10 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50/50 backdrop-blur-md px-2.5 text-[11px] font-semibold text-neutral-400 select-none xl:flex shadow-sm">
            <Command className="h-3 w-3" />
            <span>K</span>
          </kbd>
        </div>


        {/* Right Action Controls */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <TenantSwitcher />
          
          {/* Notifications Button */}
          <button className="group focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200/80 bg-white text-neutral-600 shadow-sm transition-all duration-200 hover:bg-neutral-50 hover:text-neutral-900 active:scale-[0.95]">
            <span className="sr-only">Notifications</span>
            <Bell className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white">
              <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75" />
            </span>
          </button>

          {/* User Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={cn(
                "focus-ring flex h-9 items-center gap-2 rounded-lg border border-neutral-200/80 bg-white pl-2 pr-2.5 text-left text-sm shadow-sm transition-all duration-200 select-none hover:bg-neutral-50 hover:border-neutral-300 active:scale-[0.98]",
                isProfileOpen && "border-neutral-900 bg-neutral-50"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-950 text-[10px] font-bold text-white uppercase shadow-sm overflow-hidden shrink-0">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  displayName.substring(0, 2)
                )}
              </span>
              <span className="hidden max-w-24 truncate sm:inline text-xs font-semibold text-neutral-700">
                {displayName}
              </span>
              <ChevronDown 
                className={cn(
                  "h-3 w-3 text-neutral-400 transition-transform duration-200 ml-0.5",
                  isProfileOpen && "rotate-180 text-neutral-700"
                )}
              />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-1.5 w-56 origin-top-right rounded-xl border border-neutral-200/80 bg-white/95 backdrop-blur-md p-1.5 shadow-lg z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                <div className="px-2.5 py-2 border-b border-neutral-100 mb-1">
                  <p className="text-xs font-bold text-neutral-800 truncate">
                    {user ? `${user.firstName || ""} ${user.lastName || ""}` : "Guest User"}
                  </p>
                  <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                    {user?.email ?? "Not signed in"}
                  </p>
                </div>
                
                <div className="space-y-0.5">
                  <Link
                    href="/settings"
                    onClick={handleProfileOptionClick}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950 active:bg-neutral-100 transition-colors duration-150"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </Link>

                  {user ? (
                    <button
                      onClick={() => {
                        handleProfileOptionClick();
                        void logout();
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 transition-colors duration-150"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleProfileOptionClick();
                        window.location.assign("/login");
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 active:bg-indigo-100 transition-colors duration-150"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Sign in</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile navigation tab list */}
      <nav className="flex gap-2 overflow-x-auto border-t border-neutral-100 px-4 py-2 lg:hidden">
        {mainNavigation.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50 active:scale-95",
              )}
              href={item.href}
              key={item.name}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

