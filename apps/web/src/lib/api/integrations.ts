import { apiFetch } from "@/lib/api/client";

export type IntegrationStatusResponse = {
  connected: boolean;
  status: "ACTIVE" | "DISCONNECTED" | "ERROR";
  provider: string;
  lastSyncAt?: string | null;
  propertyId?: string | null;
  measurementId?: string | null;
  metadata?: {
    siteUrl?: string;
    connectedAt?: string;
  } | null;
  [key: string]: unknown;
};

export function getWooCommerceStatus() {
  return apiFetch<IntegrationStatusResponse>("/integrations/woocommerce/status");
}

export function connectWooCommerce(payload: {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
}) {
  return apiFetch<IntegrationStatusResponse>("/integrations/woocommerce/connect", {
    method: "POST",
    body: payload,
  });
}

export function disconnectWooCommerce() {
  return apiFetch<any>("/integrations/woocommerce/disconnect", {
    method: "POST",
  });
}

export function syncWooCommerce(full = false) {
  return apiFetch<{ success: boolean; orders: any; products: any }>("/integrations/woocommerce/sync", {
    method: "POST",
    body: { full },
  });
}

// Google Ads
export type GoogleAdsStatusResponse = {
  connected: boolean;
  customerId?: string | null;
  status: "ACTIVE" | "DISCONNECTED";
};

export function getGoogleAdsStatus() {
  // Returns if a connection exists
  return apiFetch<GoogleAdsStatusResponse>("/integrations/google-ads/campaigns")
    .then(() => ({ connected: true, status: "ACTIVE" as const }))
    .catch((err) => {
      // If 404 or 400, it's not connected or missing token
      return { connected: false, status: "DISCONNECTED" as const };
    });
}

export function getGoogleAdsOAuthUrl() {
  return apiFetch<{ url: string }>("/integrations/google-ads/oauth/url");
}

export function connectGoogleAds(payload: {
  refreshToken: string;
  customerId: string;
}) {
  return apiFetch<any>("/integrations/google-ads/connect", {
    method: "POST",
    body: payload,
  });
}

export function connectGoogleAdsCustomer(payload: {
  customerId: string;
}) {
  return apiFetch<any>("/integrations/google-ads/connect-customer", {
    method: "POST",
    body: payload,
  });
}

export function disconnectGoogleAds() {
  return apiFetch<any>("/integrations/google-ads/disconnect", {
    method: "POST",
  });
}

export function syncGoogleAdsCampaigns() {
  return apiFetch<{ success: boolean; syncedCount: number }>("/integrations/google-ads/sync/campaigns", {
    method: "POST",
  });
}

export function getGoogleAdsCampaigns() {
  return apiFetch<any[]>("/integrations/google-ads/campaigns");
}

export function getGa4Status() {
  return apiFetch<IntegrationStatusResponse>("/integrations/ga4/status");
}

export function connectGa4(payload: {
  propertyId: string;
  measurementId?: string;
  apiSecret?: string;
}) {
  return apiFetch<any>("/integrations/ga4/connect", {
    method: "POST",
    body: payload,
  });
}

export function disconnectGa4() {
  return apiFetch<any>("/integrations/ga4/disconnect", {
    method: "POST",
  });
}

export function syncGa4Sessions(payload: {
  date: string;
  sessions: number;
  newContacts?: number;
  revenue?: number;
  orders?: number;
}) {
  return apiFetch<any>("/integrations/ga4/sync/sessions", {
    method: "POST",
    body: payload,
  });
}
