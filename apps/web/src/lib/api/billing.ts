import { apiFetch } from "./client";

export type BillingUsage = {
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  contacts: {
    used: number;
    limit: number;
    percent: number;
  };
};

export function getBillingUsage() {
  return apiFetch<BillingUsage>("/billing/usage");
}
