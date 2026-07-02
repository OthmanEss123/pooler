export type Tenant = {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  plan?: "STARTER" | "GROWTH" | "SCALE";
  planStatus?:
    | "ACTIVE"
    | "TRIALING"
    | "PAST_DUE"
    | "INCOMPLETE"
    | "CANCELED"
    | "UNPAID";
  logoUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TenantMembership = {
  id: string;
  tenantId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  tenant: Tenant;
};
