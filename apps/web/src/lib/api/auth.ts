import { apiFetch } from "@/lib/api/client";
import type {
  CurrentUser,
  LoginPayload,
  LoginResponse,
  MfaPayload,
  MyTenantsResponse,
  RegisterPayload,
  RegisterResponse,
} from "@/types/auth";
import type { Tenant } from "@/types/tenant";

export function login(payload: LoginPayload) {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function register(payload: RegisterPayload) {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function verifyMfa(payload: MfaPayload) {
  return apiFetch<{ user: CurrentUser }>("/auth/mfa/verify", {
    method: "POST",
    body: payload,
  });
}

export function refreshSession() {
  return apiFetch<{ ok: boolean }>("/auth/refresh", {
    method: "POST",
  });
}

export function logout() {
  return apiFetch<{ ok: boolean }>("/auth/logout", {
    method: "POST",
  });
}

export function getCurrentUser() {
  return apiFetch<CurrentUser>("/auth/me");
}

export function getMyTenants() {
  return apiFetch<MyTenantsResponse>("/auth/my-tenants");
}

export function switchTenant(tenantId: string) {
  return apiFetch<{ tenant: Tenant }>("/auth/switch-tenant", {
    method: "POST",
    body: { tenantId },
  });
}

export function checkEmail(email: string) {
  return apiFetch<{ exists: boolean }>("/auth/check-email", {
    query: { email },
  });
}
