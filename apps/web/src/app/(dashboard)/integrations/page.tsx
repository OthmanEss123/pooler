"use client";

import { useEffect, useState } from "react";
import { BarChart3, Megaphone, Store, Loader2 } from "lucide-react";
import { IntegrationCard } from "@/components/ui/integration-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getWooCommerceStatus,
  getGoogleAdsStatus,
  getGa4Status,
} from "@/lib/api/integrations";

const icons = {
  WooCommerce: Store,
  "Google Ads": Megaphone,
  GA4: BarChart3,
};

type LocalIntegration = {
  name: string;
  description: string;
  status: "Connected" | "Needs attention" | "Disconnected";
  href: string;
  meta: string;
};

export default function IntegrationsPage() {
  const [integrationsList, setIntegrationsList] = useState<LocalIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatuses = async () => {
      setIsLoading(true);
      try {
        const [woo, google, ga4] = await Promise.allSettled([
          getWooCommerceStatus(),
          getGoogleAdsStatus(),
          getGa4Status(),
        ]);

        const wooConnected = woo.status === "fulfilled" && woo.value.status === "ACTIVE";
        const googleConnected = google.status === "fulfilled" && google.value.status === "ACTIVE";
        const ga4Connected = ga4.status === "fulfilled" && ga4.value.status === "ACTIVE";

        setIntegrationsList([
          {
            name: "WooCommerce",
            description: "Sync orders, customers, products and store webhooks.",
            status: wooConnected ? "Connected" : "Disconnected",
            href: "/integrations/woocommerce",
            meta: wooConnected ? "Webhook active" : "Connection required",
          },
          {
            name: "Google Ads",
            description: "Import campaign spend, performance metrics and audience sync.",
            status: googleConnected ? "Connected" : "Disconnected",
            href: "/integrations/google-ads",
            meta: googleConnected ? "Synced campaigns" : "Connection required",
          },
          {
            name: "GA4",
            description: "Connect visitor events, attribution data and session signals.",
            status: ga4Connected ? "Connected" : "Disconnected",
            href: "/integrations/ga4",
            meta: ga4Connected ? "GA4 active" : "Connection required",
          },
        ]);
      } catch (err) {
        console.error("Failed to load integrations:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatuses();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Connect commerce, advertising and analytics systems so every dashboard and copilot recommendation has fresh data."
        eyebrow="Data sources"
        title="Integrations"
      />

      <div className="grid gap-4 md:grid-cols-3">
        {integrationsList.map((integration) => (
          <IntegrationCard
            description={integration.description}
            href={integration.href}
            icon={icons[integration.name as keyof typeof icons]}
            key={integration.name}
            meta={integration.meta}
            name={integration.name}
            status={integration.status}
          />
        ))}
      </div>
    </div>
  );
}
