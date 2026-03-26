import type { ApiKeyScope, UserRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedRole = UserRole | 'API_KEY';

export interface AuthenticatedUser {
  id: string | null;
  tenantId: string;
  email: string | null;
  role: AuthenticatedRole;
  scope?: ApiKeyScope;
  isActive: boolean;
}

export interface AuthCookies {
  access_token?: string;
  refresh_token?: string;
  token_family?: string;
}

export type AuthRequest = Request & {
  user?: AuthenticatedUser;
  cookies?: AuthCookies;
};
