export type EmailStatus =
  | "SUBSCRIBED"
  | "UNSUBSCRIBED"
  | "BOUNCED"
  | "COMPLAINED"
  | "PENDING";

export type Contact = {
  id: string;
  tenantId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  sourceChannel?: string | null;
  emailStatus: EmailStatus;
  totalRevenue: string | number;
  totalOrders: number;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};
