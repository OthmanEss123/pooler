import { AdCampaignStatus, AdCampaignType } from '@prisma/client';
import { GoogleAdsMapper } from '../../src/modules/integrations/google-ads/google-ads-mapper';
import {
  googleAdsSearchResponse,
  googleAdsTokenResponse,
} from '../support/google-ads-mock';

describe('Google Ads API Contract', () => {
  describe('GoogleAdsMapper.mapCampaignStatus', () => {
    it('devrait mapper ENABLED -> ENABLED', () => {
      expect(GoogleAdsMapper.mapCampaignStatus('ENABLED')).toBe(
        AdCampaignStatus.ENABLED,
      );
    });

    it('devrait mapper PAUSED -> PAUSED', () => {
      expect(GoogleAdsMapper.mapCampaignStatus('PAUSED')).toBe(
        AdCampaignStatus.PAUSED,
      );
    });

    it('devrait mapper REMOVED -> REMOVED', () => {
      expect(GoogleAdsMapper.mapCampaignStatus('REMOVED')).toBe(
        AdCampaignStatus.REMOVED,
      );
    });

    it('devrait mapper undefined -> PAUSED', () => {
      expect(GoogleAdsMapper.mapCampaignStatus(undefined)).toBe(
        AdCampaignStatus.PAUSED,
      );
    });

    it('devrait mapper un statut inconnu vers PAUSED', () => {
      expect(GoogleAdsMapper.mapCampaignStatus('SOMETHING_ELSE')).toBe(
        AdCampaignStatus.PAUSED,
      );
    });
  });

  describe('GoogleAdsMapper.mapCampaignType', () => {
    it('devrait mapper SEARCH -> SEARCH', () => {
      expect(GoogleAdsMapper.mapCampaignType('SEARCH')).toBe(
        AdCampaignType.SEARCH,
      );
    });

    it('devrait mapper SHOPPING -> SHOPPING', () => {
      expect(GoogleAdsMapper.mapCampaignType('SHOPPING')).toBe(
        AdCampaignType.SHOPPING,
      );
    });

    it('devrait mapper PERFORMANCE_MAX -> PERFORMANCE_MAX', () => {
      expect(GoogleAdsMapper.mapCampaignType('PERFORMANCE_MAX')).toBe(
        AdCampaignType.PERFORMANCE_MAX,
      );
    });

    it('devrait fallback sur SEARCH pour les types inconnus', () => {
      expect(GoogleAdsMapper.mapCampaignType('UNKNOWN')).toBe(
        AdCampaignType.SEARCH,
      );
    });
  });

  describe('GoogleAdsMapper.extractId', () => {
    it('devrait extraire le dernier segment du resource name', () => {
      expect(
        GoogleAdsMapper.extractId('customers/1234567890/campaigns/9876543210'),
      ).toBe('9876543210');
    });

    it('devrait gerer un resource name simple', () => {
      expect(GoogleAdsMapper.extractId('9876543210')).toBe('9876543210');
    });

    it('devrait gerer un trailing slash', () => {
      expect(GoogleAdsMapper.extractId('customers/1234567890/campaigns/')).toBe(
        '',
      );
    });
  });

  describe('GoogleAdsMapper.mapMetrics', () => {
    it('devrait convertir costMicros en spend (decimal)', () => {
      const result = GoogleAdsMapper.mapMetrics({
        metrics: {
          costMicros: '12500000',
          impressions: '15234',
          clicks: '821',
          conversions: '23.5',
          conversionsValue: '1875.45',
        },
      });

      expect(Number(result.spend)).toBeCloseTo(12.5);
      expect(result.impressions).toBe(15234);
      expect(result.clicks).toBe(821);
      expect(Number(result.conversions)).toBeCloseTo(23.5);
      expect(Number(result.conversionValue)).toBeCloseTo(1875.45);
    });

    it('devrait calculer le ROAS (conversionValue / spend)', () => {
      const result = GoogleAdsMapper.mapMetrics({
        metrics: {
          costMicros: '10000000',
          impressions: '100',
          clicks: '10',
          conversions: '2',
          conversionsValue: '50',
        },
      });

      expect(Number(result.spend)).toBeCloseTo(10);
      expect(Number(result.roas)).toBeCloseTo(5);
    });

    it('devrait retourner roas=0 quand spend=0', () => {
      const result = GoogleAdsMapper.mapMetrics({
        metrics: {
          costMicros: '0',
          impressions: '0',
          clicks: '0',
        },
      });

      expect(Number(result.spend)).toBe(0);
      expect(Number(result.roas)).toBe(0);
    });

    it('devrait accepter snake_case (cost_micros / conversions_value)', () => {
      const result = GoogleAdsMapper.mapMetrics({
        metrics: {
          cost_micros: '5000000',
          conversions_value: '15',
        },
      });

      expect(Number(result.spend)).toBeCloseTo(5);
      expect(Number(result.conversionValue)).toBeCloseTo(15);
    });

    it('devrait gerer les metriques manquantes avec des valeurs par defaut', () => {
      const result = GoogleAdsMapper.mapMetrics({});

      expect(Number(result.spend)).toBe(0);
      expect(result.impressions).toBe(0);
      expect(result.clicks).toBe(0);
      expect(Number(result.conversions)).toBe(0);
      expect(Number(result.conversionValue)).toBe(0);
      expect(Number(result.roas)).toBe(0);
    });
  });

  describe('Contract avec les fixtures search', () => {
    it('devrait pouvoir mapper toutes les campagnes du payload search', () => {
      for (const row of googleAdsSearchResponse.results) {
        const campaignId = GoogleAdsMapper.extractId(row.campaign.resourceName);
        expect(campaignId).toMatch(/^\d+$/);

        const status = GoogleAdsMapper.mapCampaignStatus(row.campaign.status);
        expect([
          AdCampaignStatus.ENABLED,
          AdCampaignStatus.PAUSED,
          AdCampaignStatus.REMOVED,
        ]).toContain(status);

        const type = GoogleAdsMapper.mapCampaignType(
          row.campaign.advertisingChannelType,
        );
        expect([
          AdCampaignType.SEARCH,
          AdCampaignType.SHOPPING,
          AdCampaignType.PERFORMANCE_MAX,
          AdCampaignType.DISPLAY,
          AdCampaignType.VIDEO,
        ]).toContain(type);

        const metrics = GoogleAdsMapper.mapMetrics({ metrics: row.metrics });
        expect(Number.isFinite(Number(metrics.spend))).toBe(true);
      }
    });
  });

  describe('OAuth token contract', () => {
    it('le payload OAuth doit contenir un access_token', () => {
      expect(googleAdsTokenResponse).toHaveProperty('access_token');
      expect(typeof googleAdsTokenResponse.access_token).toBe('string');
      expect(googleAdsTokenResponse.access_token.length).toBeGreaterThan(0);
    });
  });
});
