"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  MousePointerClick,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
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
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ApiError } from "@/lib/api/client";
import {
  getAnalyticsSummary,
  getRevenueSeries,
  getRoasSeries,
} from "@/lib/api/analytics";
import { formatCompact, formatCurrency, formatNumber } from "@/lib/format";
import { channels, revenueBars } from "@/lib/mock-data";
import type {
  AnalyticsSummary,
  RevenueTimeSeriesItem,
  RoasTimeSeriesItem,
} from "@/types/analytics";

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeBars(series: RevenueTimeSeriesItem[]) {
  const values = series.slice(-12).map((item) => item.revenue);
  const max = Math.max(...values, 1);
  return values.map((value) => Math.max(12, Math.round((value / max) * 96)));
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<RevenueTimeSeriesItem[]>([]);
  const [roasSeries, setRoasSeries] = useState<RoasTimeSeriesItem[]>([]);
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
      getRoasSeries(range),
    ])
      .then(([nextSummary, nextRevenueSeries, nextRoasSeries]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setRevenueSeries(nextRevenueSeries);
        setRoasSeries(nextRoasSeries);
        setError(null);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load analytics from the backend.",
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
  const chartValues =
    revenueSeries.length > 0 ? normalizeBars(revenueSeries) : revenueBars;
  const latestRoas = roasSeries.at(-1)?.roas ?? summary?.blendedRoas ?? 0;
  const funnel = [
    {
      label: "Sessions",
      value: formatNumber(summary?.totalSessions ?? 0),
      width: "100%",
    },
    {
      label: "Product views",
      value: formatNumber((summary?.totalSessions ?? 0) * 0.58),
      width: "76%",
    },
    {
      label: "Add to cart",
      value: formatNumber((summary?.totalSessions ?? 0) * 0.14),
      width: "42%",
    },
    {
      label: "Checkout",
      value: formatNumber((summary?.totalSessions ?? 0) * 0.07),
      width: "24%",
    },
    {
      label: "Purchase",
      value: formatNumber(summary?.totalOrders ?? 0),
      width: "14%",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button icon={<CalendarDays className="h-4 w-4" />} variant="secondary">
              Last 30 days
            </Button>
            <Button>Build report</Button>
          </>
        }
        description="Measure revenue, acquisition efficiency and customer movement across your connected marketing and commerce data."
        eyebrow="Analytics"
        title="Performance command center"
      />

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          change={isLoading ? "Loading" : "Live"}
          detail="net revenue"
          icon={CircleDollarSign}
          label="Revenue"
          value={formatCurrency(summary?.totalRevenue ?? 0)}
        />
        <StatCard
          change={isLoading ? "Loading" : "Live"}
          detail="synced orders"
          icon={ShoppingCart}
          label="Orders"
          value={formatCompact(summary?.totalOrders ?? 0)}
        />
        <StatCard
          change={isLoading ? "Loading" : "Live"}
          detail="blended ROAS"
          icon={TrendingUp}
          label="ROAS"
          value={`${latestRoas.toFixed(2)}x`}
        />
        <StatCard
          change={isLoading ? "Loading" : "Live"}
          detail="order/session rate"
          icon={MousePointerClick}
          label="Conversion"
          value={`${conversion.toFixed(2)}%`}
        />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Revenue by day</CardTitle>
            <CardDescription>
              Revenue trend, campaign influence and order volume.
            </CardDescription>
          </div>
          <Badge variant="brand">Backend data</Badge>
        </CardHeader>
        <CardContent>
          <ChartPlaceholder label="Daily revenue" values={chartValues} />
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Channel performance</CardTitle>
              <CardDescription>
                Revenue and return by acquisition channel.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {channels.map((channel) => (
              <div
                className="rounded-lg border border-line p-4 transition hover:bg-neutral-50"
                key={channel.name}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{channel.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {channel.revenue} revenue
                    </p>
                  </div>
                  <Badge variant={channel.change.startsWith("-") ? "warning" : "success"}>
                    {channel.change}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted">ROAS</span>
                  <span className="font-semibold text-ink">{channel.roas}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Conversion funnel</CardTitle>
              <CardDescription>
                Where visitors move from discovery to purchase.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {funnel.map((step) => (
              <div key={step.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{step.label}</span>
                  <span className="text-muted">{step.value}</span>
                </div>
                <div className="h-3 rounded-full bg-neutral-100">
                  <div
                    className="h-3 rounded-full bg-brand-500"
                    style={{ width: step.width }}
                  />
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-line bg-neutral-50 p-4">
              <div className="flex items-start gap-3">
                <ArrowUpRight className="mt-0.5 h-4 w-4 text-neutral-900" />
                <p className="text-sm leading-6 text-neutral-700">
                  Analytics summary and revenue series are loaded from the Nest
                  backend for the active tenant.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
