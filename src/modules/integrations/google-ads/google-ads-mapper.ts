import { AdCampaignStatus, AdCampaignType, Prisma } from '@prisma/client';

type RawMetrics = {
  metrics?: {
    costMicros?: string | number;
    cost_micros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
    conversions_value?: string | number;
  };
};

export class GoogleAdsMapper {
  static mapCampaignStatus(status?: string): AdCampaignStatus {
    switch (status) {
      case 'ENABLED':
        return AdCampaignStatus.ENABLED;
      case 'PAUSED':
        return AdCampaignStatus.PAUSED;
      case 'REMOVED':
        return AdCampaignStatus.REMOVED;
      default:
        return AdCampaignStatus.PAUSED;
    }
  }

  static mapCampaignType(type?: string): AdCampaignType {
    switch (type) {
      case 'SEARCH':
        return AdCampaignType.SEARCH;
      case 'SHOPPING':
        return AdCampaignType.SHOPPING;
      case 'PERFORMANCE_MAX':
        return AdCampaignType.PERFORMANCE_MAX;
      case 'DISPLAY':
        return AdCampaignType.DISPLAY;
      case 'VIDEO':
        return AdCampaignType.VIDEO;
      default:
        return AdCampaignType.SEARCH;
    }
  }

  static mapChannelToType(channel?: string): AdCampaignType {
    return this.mapCampaignType(channel);
  }

  static mapMetrics(raw: RawMetrics) {
    const costMicros = Number(
      raw.metrics?.costMicros ?? raw.metrics?.cost_micros ?? 0,
    );
    const impressions = Number(raw.metrics?.impressions ?? 0);
    const clicks = Number(raw.metrics?.clicks ?? 0);
    const conversions = Number(raw.metrics?.conversions ?? 0);
    const conversionValue = Number(
      raw.metrics?.conversionsValue ?? raw.metrics?.conversions_value ?? 0,
    );
    const spend = costMicros / 1_000_000;

    return {
      spend: new Prisma.Decimal(spend),
      impressions,
      clicks,
      conversions: new Prisma.Decimal(conversions),
      conversionValue: new Prisma.Decimal(conversionValue),
      roas:
        spend > 0
          ? new Prisma.Decimal(conversionValue / spend)
          : new Prisma.Decimal(0),
    };
  }

  static extractId(resourceName: string): string {
    const parts = resourceName.split('/');
    return parts[parts.length - 1] ?? resourceName;
  }
}
