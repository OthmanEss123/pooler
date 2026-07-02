"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMyTenants, switchTenant as switchTenantRequest } from "@/lib/api/auth";
import type { TenantMembership } from "@/types/tenant";

export function useTenant(currentTenantId?: string) {
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMemberships(await getMyTenants());
    } catch (fetchError) {
      setError(fetchError);
      setMemberships([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const currentTenant = useMemo(() => {
    return (
      memberships.find((membership) => membership.tenantId === currentTenantId)
        ?.tenant ?? memberships[0]?.tenant ?? null
    );
  }, [currentTenantId, memberships]);

  const switchTenant = useCallback(async (tenantId: string) => {
    await switchTenantRequest(tenantId);
    window.location.reload();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    memberships,
    currentTenant,
    isLoading,
    error,
    reload: load,
    switchTenant,
  };
}
