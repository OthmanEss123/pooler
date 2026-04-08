import { AdCampaignStatus } from '@prisma/client';

type RawAction = { action_type?: string; value?: string };

export class FacebookAdsMapper {
  static mapCampaignStatus(status?: string): AdCampaignStatus {
    switch (status) {
      case 'ACTIVE':
        return AdCampaignStatus.ENABLED;
      case 'PAUSED':
        return AdCampaignStatus.PAUSED;
      case 'ARCHIVED':
        return AdCampaignStatus.REMOVED;
      case 'DELETED':
        return AdCampaignStatus.PAUSED;
      default:
        return AdCampaignStatus.PAUSED;
    }
  }

  static mapMetrics(raw: {
    spend?: string;
    impressions?: string;
    clicks?: string;
    actions?: RawAction[];
    action_values?: RawAction[];
  }) {
    const spend = Number.parseFloat(raw.spend ?? '0');
    const impressions = Number.parseInt(raw.impressions ?? '0', 10);
    const clicks = Number.parseInt(raw.clicks ?? '0', 10);

    let conversions = 0;
    for (const action of raw.actions ?? []) {
      const v = Number.parseFloat(action.value ?? '0');
      if (Number.isFinite(v)) {
        conversions += v;
      }
    }

    let conversionValue = 0;
    for (const entry of raw.action_values ?? []) {
      const v = Number.parseFloat(entry.value ?? '0');
      if (Number.isFinite(v)) {
        conversionValue += v;
      }
    }

    const roas = spend > 0 ? conversionValue / spend : 0;

    return {
      spend,
      impressions,
      clicks,
      conversions,
      conversionValue,
      roas,
    };
  }
}
