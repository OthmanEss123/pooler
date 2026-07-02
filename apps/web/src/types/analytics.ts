export type AnalyticsSummary = {
  totalRevenue: number;
  totalOrders: number;
  totalSessions: number;
  newContacts: number;
  adsSpend: number;
  blendedRoas: number;
  mer: number;
  anomalies: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    message: string;
    currentRevenue?: number;
    averageRevenue7d?: number;
    ratio?: number;
  }>;
};

export type RevenueTimeSeriesItem = {
  period: string;
  revenue: number;
  orders: number;
  sessions: number;
};

export type RoasTimeSeriesItem = {
  date: string;
  roas: number;
  mer: number;
};
