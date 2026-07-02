"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bot,
  Plug,
  ShoppingBag,
  ShoppingCart,
  Users,
  Wallet,
  Store,
  Megaphone,
} from "lucide-react";

const icons = {
  WooCommerce: Store,
  "Google Ads": Megaphone,
  GA4: BarChart3,
};
import { ChartPlaceholder } from "@/components/charts/chart-placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { IntegrationCard } from "@/components/ui/integration-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ApiError } from "@/lib/api/client";
import { getAnalyticsSummary, getRevenueSeries } from "@/lib/api/analytics";
import { getContacts } from "@/lib/api/contacts";
import { getOrders } from "@/lib/api/orders";
import { getWooCommerceStatus, getGoogleAdsStatus, getGa4Status } from "@/lib/api/integrations";
import { formatCompact, formatCurrency, formatDate } from "@/lib/format";
import { revenueBars } from "@/lib/mock-data";
import type { AnalyticsSummary, RevenueTimeSeriesItem } from "@/types/analytics";
import type { Contact } from "@/types/contact";
import type { Order } from "@/types/order";

type LocalIntegration = {
  name: string;
  description: string;
  status: "Connected" | "Needs attention" | "Disconnected";
  href: string;
  meta: string;
};

const statIcons = [Wallet, ShoppingCart, Users, BarChart3];

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function contactName(contact: Contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return name || contact.email;
}

function orderCustomer(order: Order) {
  const name = [order.contact?.firstName, order.contact?.lastName]
    .filter(Boolean)
    .join(" ");
  return name || order.contact?.email || order.contactId;
}

function normalizeBars(series: RevenueTimeSeriesItem[]) {
  const values = series.slice(-12).map((item) => item.revenue);
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(12, Math.round((value / max) * 96)));
}

const orderColumns: Array<DataTableColumn<Order>> = [
  {
    header: "Order",
    cell: (row) => (
      <div>
        <p className="font-semibold text-ink">
          #{row.orderNumber ?? row.externalId}
        </p>
        <p className="text-xs text-muted">{formatDate(row.placedAt)}</p>
      </div>
    ),
  },
  {
    header: "Customer",
    cell: (row) => (
      <div>
        <p className="font-medium text-ink">{orderCustomer(row)}</p>
        <p className="text-xs text-muted">{row.contact?.email ?? row.contactId}</p>
      </div>
    ),
  },
  {
    header: "Total",
    cell: (row) => formatCurrency(row.totalAmount, row.currency),
  },
  {
    header: "Status",
    cell: (row) => (
      <Badge variant={row.status === "PENDING" ? "warning" : "success"}>
        {row.status.toLowerCase()}
      </Badge>
    ),
  },
];

const contactColumns: Array<DataTableColumn<Contact>> = [
  {
    header: "Contact",
    cell: (row) => (
      <div>
        <p className="font-medium text-ink">{contactName(row)}</p>
        <p className="text-xs text-muted">{row.email}</p>
      </div>
    ),
  },
  { header: "Source", cell: (row) => row.sourceChannel ?? "Direct" },
  {
    header: "Revenue",
    cell: (row) => formatCurrency(row.totalRevenue),
  },
  {
    header: "Status",
    cell: (row) => (
      <Badge variant={row.emailStatus === "SUBSCRIBED" ? "success" : "warning"}>
        {row.emailStatus.toLowerCase()}
      </Badge>
    ),
  },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [revenueSeries, setRevenueSeries] = useState<RevenueTimeSeriesItem[]>([]);
  const [integrationsList, setIntegrationsList] = useState<LocalIntegration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return { from: dateOnly(from), to: dateOnly(to), granularity: "day" as const };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getAnalyticsSummary(range),
      getRevenueSeries(range),
      getOrders({ limit: 5 }),
      getContacts({ limit: 5 }),
      Promise.allSettled([
        getWooCommerceStatus(),
        getGoogleAdsStatus(),
        getGa4Status(),
      ]),
    ])
      .then(([nextSummary, nextRevenue, nextOrders, nextContacts, integrationStatuses]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setRevenueSeries(nextRevenue);
        setOrders(nextOrders.data);
        setContacts(nextContacts.data);
        setContactTotal(nextContacts.total);

        const woo = integrationStatuses[0];
        const google = integrationStatuses[1];
        const ga4 = integrationStatuses[2];
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

        setError(null);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load dashboard data from the backend.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const conversion =
    summary && summary.totalSessions > 0
      ? (summary.totalOrders / summary.totalSessions) * 100
      : 0;
  const stats = [
    {
      label: "Revenue",
      value: formatCurrency(summary?.totalRevenue ?? 0),
      change: isLoading ? "Loading" : "Live",
      detail: "last 30 days",
      trend: "up" as const,
    },
    {
      label: "Orders",
      value: formatCompact(summary?.totalOrders ?? 0),
      change: isLoading ? "Loading" : "Live",
      detail: "synced stores",
      trend: "up" as const,
    },
    {
      label: "Contacts",
      value: formatCompact(contactTotal || summary?.newContacts || 0),
      change: isLoading ? "Loading" : "Live",
      detail: "active profiles",
      trend: "up" as const,
    },
    {
      label: "Conversion rate",
      value: `${conversion.toFixed(2)}%`,
      change: isLoading ? "Loading" : "Live",
      detail: "orders / sessions",
      trend: "up" as const,
    },
  ];
  const chartValues =
    revenueSeries.length > 0 ? normalizeBars(revenueSeries) : revenueBars;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button variant="secondary">Export report</Button>
            <Button>Sync data</Button>
          </>
        }
        description="A live view of revenue, customers, marketing channels and operational signals across the active tenant."
        eyebrow="Executive overview"
        title="Good morning"
      />

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <StatCard
            detail={stat.detail}
            change={stat.change}
            icon={statIcons[index]}
            key={stat.label}
            label={stat.label}
            trend={stat.trend}
            value={stat.value}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Revenue momentum</CardTitle>
              <CardDescription>
                Blended revenue and order activity from connected channels.
              </CardDescription>
            </div>
            <Badge variant="brand">Backend data</Badge>
          </CardHeader>
          <CardContent>
            <ChartPlaceholder values={chartValues} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Copilot insight</CardTitle>
              <CardDescription>
                A focused recommendation based on campaign and store signals.
              </CardDescription>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-900">
              <Bot className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-line bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-ink">
                Recover high-intent carts
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                Cart abandonment and paid traffic signals can be connected to
                Copilot recommendations once the backend recommendation stream is
                enabled.
              </p>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line p-4">
                <p className="text-xs text-muted">Potential recovery</p>
                <p className="mt-2 text-xl font-semibold text-ink">$9.8K</p>
              </div>
              <div className="rounded-lg border border-line p-4">
                <p className="text-xs text-muted">Audience size</p>
                <p className="mt-2 text-xl font-semibold text-ink">1,842</p>
              </div>
            </div>
            <Button className="mt-5 w-full">Open copilot</Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent orders</CardTitle>
              <CardDescription>Latest synced commerce activity.</CardDescription>
            </div>
            <ShoppingBag className="h-5 w-5 text-neutral-400" />
          </CardHeader>
          <CardContent>
            {isLoading && orders.length === 0 ? (
              <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
                Loading orders...
              </div>
            ) : (
              <DataTable
                columns={orderColumns}
                data={orders}
                empty={
                  <EmptyState
                    description="Orders will appear when commerce data syncs."
                    icon={ShoppingCart}
                    title="No recent orders"
                  />
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent contacts</CardTitle>
              <CardDescription>New and high-value customer profiles.</CardDescription>
            </div>
            <Users className="h-5 w-5 text-neutral-400" />
          </CardHeader>
          <CardContent>
            {isLoading && contacts.length === 0 ? (
              <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
                Loading contacts...
              </div>
            ) : (
              <DataTable
                columns={contactColumns}
                data={contacts}
                empty={
                  <EmptyState
                    description="Contacts will appear when customer data syncs."
                    icon={Users}
                    title="No recent contacts"
                  />
                }
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Integration health</h2>
            <p className="text-sm text-muted">Store, ads and analytics status.</p>
          </div>
          <Plug className="h-5 w-5 text-neutral-400" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {integrationsList.map((integration) => (
            <IntegrationCard
              description={integration.description}
              href={integration.href}
              icon={icons[integration.name as keyof typeof icons] || Plug}
              key={integration.name}
              meta={integration.meta}
              name={integration.name}
              status={integration.status}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
