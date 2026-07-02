"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCurrentUser,
  logout as logoutRequest,
  refreshSession,
} from "@/lib/api/auth";
import { isApiUnauthorized } from "@/lib/api/client";
import type { CurrentUser } from "@/types/auth";

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setUser(await getCurrentUser());
    } catch (initialError) {
      if (!isApiUnauthorized(initialError)) {
        setError(initialError);
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const refreshed = await refreshSession();
        if (!refreshed.ok) {
          setUser(null);
          return;
        }
        setUser(await getCurrentUser());
      } catch (refreshError) {
        setError(refreshError);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    window.location.assign("/login");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    user,
    isLoading,
    error,
    reload: load,
    logout,
  };
}
