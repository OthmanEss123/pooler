import { apiFetch } from "@/lib/api/client";
import type {
  AnalyticsSummary,
  RevenueTimeSeriesItem,
  RoasTimeSeriesItem,
} from "@/types/analytics";

export type AnalyticsQuery = {
  from: string;
  to: string;
  granularity?: "day" | "week" | "month";
};

export function getAnalyticsSummary(query: AnalyticsQuery) {
  return apiFetch<AnalyticsSummary>("/analytics/summary", { query });
}

export function getRevenueSeries(query: AnalyticsQuery) {
  return apiFetch<RevenueTimeSeriesItem[]>("/analytics/revenue", { query });
}

export function getRoasSeries(query: AnalyticsQuery) {
  return apiFetch<RoasTimeSeriesItem[]>("/analytics/roas", { query });
}
