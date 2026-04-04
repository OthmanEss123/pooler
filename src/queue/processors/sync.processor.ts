import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { GoogleAdsService } from '../../modules/integrations/google-ads/google-ads.service';
import { WooCommerceService } from '../../modules/integrations/woocommerce/woocommerce.service';
import type {
  SyncGoogleAdsPayload,
  SyncSegmentPayload,
  SyncShopifyPayload,
  SyncWoocommercePayload,
} from '../services/sync-queue.service';

@Processor('sync')
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly googleAdsService: GoogleAdsService,
    @Inject(forwardRef(() => WooCommerceService))
    private readonly wooCommerceService: WooCommerceService,
  ) {
    super();
  }

  async process(
    job: Job<
      | SyncShopifyPayload
      | SyncWoocommercePayload
      | SyncSegmentPayload
      | SyncGoogleAdsPayload
    >,
  ): Promise<void> {
    switch (job.name) {
      case 'sync-shopify':
        this.handleSyncShopify(job as Job<SyncShopifyPayload>);
        break;
      case 'sync-woocommerce':
        await this.handleSyncWoocommerce(job as Job<SyncWoocommercePayload>);
        break;
      case 'sync-segment':
        await this.handleSyncSegment(job as Job<SyncSegmentPayload>);
        break;
      case 'sync-google-ads':
        await this.handleSyncGoogleAds(job as Job<SyncGoogleAdsPayload>);
        break;
      default:
        this.logger.warn(`Unknown sync job: ${job.name}`);
    }
  }

  private handleSyncShopify(job: Job<SyncShopifyPayload>): void {
    const { tenantId, full } = job.data;
    this.logger.log(
      `Sync Shopify for tenant ${tenantId} (full=${String(full)}) - placeholder for week 8`,
    );
  }

  private async handleSyncWoocommerce(
    job: Job<SyncWoocommercePayload>,
  ): Promise<void> {
    const { tenantId, full } = job.data;
    this.logger.log(
      `Sync WooCommerce for tenant ${tenantId} (full=${String(full)})`,
    );

    await this.wooCommerceService.syncOrders(tenantId, full);
    await this.wooCommerceService.syncProducts(tenantId);
  }

  private async handleSyncSegment(job: Job<SyncSegmentPayload>): Promise<void> {
    const { tenantId, segmentId } = job.data;
    this.logger.log(`Sync segment ${segmentId} for tenant ${tenantId}`);

    const segment = await this.prisma.segment.findFirst({
      where: { id: segmentId, tenantId },
    });

    if (!segment) {
      this.logger.warn(`Segment ${segmentId} not found, skipping`);
      return;
    }

    this.logger.log(`Segment ${segmentId} sync completed`);
  }

  private async handleSyncGoogleAds(
    job: Job<SyncGoogleAdsPayload>,
  ): Promise<void> {
    const {
      tenantId,
      campaignId,
      date,
      spend,
      impressions,
      clicks,
      conversions,
    } = job.data;

    const hasInlineMetricsPayload =
      campaignId !== undefined ||
      date !== undefined ||
      spend !== undefined ||
      impressions !== undefined ||
      clicks !== undefined ||
      conversions !== undefined;

    if (!hasInlineMetricsPayload) {
      await this.googleAdsService.syncCampaigns(tenantId);

      const today = new Date();
      const dateTo = today.toISOString().slice(0, 10);
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      const dateFrom = from.toISOString().slice(0, 10);

      await this.googleAdsService.syncMetrics(tenantId, dateFrom, dateTo);

      this.logger.log(
        `Google Ads full sync completed for tenant=${tenantId}, from=${dateFrom}, to=${dateTo}`,
      );
      return;
    }

    if (
      !campaignId ||
      !date ||
      spend === undefined ||
      impressions === undefined ||
      clicks === undefined ||
      conversions === undefined
    ) {
      this.logger.warn(
        `Skipping Google Ads sync for tenant ${tenantId}: incomplete metrics payload`,
      );
      return;
    }

    await this.analyticsService.ingestAdMetrics({
      tenantId,
      campaignId,
      date,
      spend,
      impressions,
      clicks,
      conversions,
    });

    this.logger.log(
      `Google Ads metrics synced for tenant=${tenantId}, campaign=${campaignId}, date=${date}`,
    );
  }
}
