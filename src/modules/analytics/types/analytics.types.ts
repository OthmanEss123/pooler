export type AnomalySeverity = 'HIGH' | 'MEDIUM';
export type AttributionModel = 'last_touch' | 'first_touch';

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
  emailRevenue: number;
  adsSpend: number;
  blendedRoas: number;
  mer: number;
  anomalies: AnalyticsAnomaly[];
}

export interface RevenueTimeSeriesItem {
  period: string;
  revenue: number;
  orders: number;
}

export interface EmailFunnelMetricItem {
  type: string;
  count: number;
}

export interface BlendedRoasTimeSeriesItem {
  date: string;
  roas: number;
  mer: number;
}

export interface AttributionCampaignItem {
  campaignId: string;
  name: string;
  attributedRevenue: number;
  attributedOrders: number;
  clicks: number;
  opens: number;
  revenueShare: number;
}

export interface AttributionSummaryItem {
  model: AttributionModel;
  from: string;
  to: string;
  totalRevenue: number;
  attributedRevenue: number;
  unattributedRevenue: number;
  unattributedOrders: number;
  campaigns: AttributionCampaignItem[];
}
