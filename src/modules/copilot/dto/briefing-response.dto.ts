export type BriefingInsightDto = {
  type: string;
  title: string;
  description: string | null;
};

export type BriefingCampaignDto = {
  name: string;
  openRate: number;
  revenue: number;
};

export type BriefingForecastDto = {
  total30d: number;
  trend: string;
  confidence: number;
};

export type BriefingPeriodDto = {
  date: string;
  yesterdayFrom: string;
  yesterdayTo: string;
  todayFrom: string;
  todayTo: string;
};

export class BriefingResponseDto {
  generatedAt!: string;
  period!: BriefingPeriodDto;
  yesterday!: {
    revenue: number;
    orders: number;
    emailRevenue: number;
    adsSpend: number;
  };
  today!: {
    revenueToDate: number;
    ordersToDate: number;
  };
  insights!: BriefingInsightDto[];
  healthScores!: Record<string, number>;
  topCampaigns!: BriefingCampaignDto[];
  forecast!: BriefingForecastDto;
}
