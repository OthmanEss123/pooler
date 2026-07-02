import type { Tenant, TenantMembership } from "@/types/tenant";

export type UserRole = "OWNER" | "ADMIN" | "MEMBER" | "API_KEY";

export type CurrentUser = {
  id: string | null;
  tenantId: string;
  email: string | null;
  role: UserRole;
  scope?: "FULL_ACCESS" | "READ_ONLY" | "INGEST";
  isActive: boolean;
  emailVerified: boolean;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type RegisterPayload = {
  tenantName: string;
  tenantSlug: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  logoUrl?: string;
  inviteToken?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResponse =
  | {
      requiresMfa: true;
      mfaTempToken: string;
    }
  | {
      user: CurrentUser;
    };

export type RegisterResponse = {
  user: CurrentUser;
  tenant: Tenant;
};

export type MfaPayload = {
  mfaTempToken: string;
  totpCode: string;
};

export type MyTenantsResponse = TenantMembership[];
