export type AnomalySeverity = 'HIGH' | 'MEDIUM';

export interface AnalyticsAnomaly {
  severity: AnomalySeverity;
  message: string;
  currentRevenue: number;
  averageRevenue7d: number;
  ratio: number;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  totalSessions: number;
  newContacts: number;
  adsSpend: number;
  blendedRoas: number;
  mer: number;
  anomalies: AnalyticsAnomaly[];
}

export interface RevenueTimeSeriesItem {
  period: string;
  revenue: number;
  orders: number;
  sessions: number;
}

export interface BlendedRoasTimeSeriesItem {
  date: string;
  roas: number;
  mer: number;
}
