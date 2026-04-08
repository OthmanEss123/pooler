import { AdCampaignStatus } from '@prisma/client';
import { FacebookAdsMapper } from '../../src/modules/integrations/facebook-ads/facebook-ads-mapper';

describe('Facebook Ads API Contract', () => {
  describe('FacebookAdsMapper.mapCampaignStatus', () => {
    it('devrait mapper ACTIVE -> ENABLED', () => {
      expect(FacebookAdsMapper.mapCampaignStatus('ACTIVE')).toBe(
        AdCampaignStatus.ENABLED,
      );
    });

    it('devrait mapper PAUSED -> PAUSED', () => {
      expect(FacebookAdsMapper.mapCampaignStatus('PAUSED')).toBe(
        AdCampaignStatus.PAUSED,
      );
    });

    it('devrait mapper ARCHIVED -> REMOVED', () => {
      expect(FacebookAdsMapper.mapCampaignStatus('ARCHIVED')).toBe(
        AdCampaignStatus.REMOVED,
      );
    });

    it('devrait mapper un statut inconnu vers PAUSED', () => {
      expect(FacebookAdsMapper.mapCampaignStatus('DELETED')).toBe(
        AdCampaignStatus.PAUSED,
      );
    });

    it('devrait mapper undefined vers PAUSED', () => {
      expect(FacebookAdsMapper.mapCampaignStatus(undefined)).toBe(
        AdCampaignStatus.PAUSED,
      );
    });
  });

  describe('FacebookAdsMapper.mapMetrics', () => {
    it('devrait parser correctement les métriques de base', () => {
      const result = FacebookAdsMapper.mapMetrics({
        spend: '12.50',
        impressions: '5000',
        clicks: '200',
      });

      expect(result.spend).toBe(12.5);
      expect(result.impressions).toBe(5000);
      expect(result.clicks).toBe(200);
    });

    it('devrait calculer les conversions depuis les actions', () => {
      const result = FacebookAdsMapper.mapMetrics({
        spend: '10',
        impressions: '100',
        clicks: '10',
        actions: [
          { action_type: 'purchase', value: '3' },
          { action_type: 'add_to_cart', value: '7' },
        ],
      });

      expect(result.conversions).toBe(10); // 3 + 7
    });

    it('devrait calculer la conversionValue depuis action_values', () => {
      const result = FacebookAdsMapper.mapMetrics({
        spend: '10',
        impressions: '100',
        clicks: '10',
        action_values: [
          { action_type: 'purchase', value: '50' },
          { action_type: 'add_to_cart', value: '20' },
        ],
      });

      expect(result.conversionValue).toBe(70); // 50 + 20
    });

    it('devrait calculer le ROAS correctement', () => {
      const result = FacebookAdsMapper.mapMetrics({
        spend: '10',
        impressions: '100',
        clicks: '10',
        action_values: [{ action_type: 'purchase', value: '50' }],
      });

      expect(Number(result.roas)).toBeCloseTo(5); // 50 / 10
    });

    it('devrait retourner roas=0 quand spend=0', () => {
      const result = FacebookAdsMapper.mapMetrics({
        spend: '0',
        impressions: '0',
        clicks: '0',
      });

      expect(Number(result.roas)).toBe(0);
    });

    it('devrait gérer les métriques manquantes avec des valeurs par défaut', () => {
      const result = FacebookAdsMapper.mapMetrics({});

      expect(result.spend).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.clicks).toBe(0);
      expect(result.conversions).toBe(0);
      expect(result.conversionValue).toBe(0);
    });
  });
});
