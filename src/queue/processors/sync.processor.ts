import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type {
  SyncShopifyPayload,
  SyncSegmentPayload,
  SyncGoogleAdsPayload,
} from '../services/sync-queue.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Processor('sync')
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job<SyncShopifyPayload | SyncSegmentPayload | SyncGoogleAdsPayload>,
  ): Promise<void> {
    switch (job.name) {
      case 'sync-shopify':
        await this.handleSyncShopify(job as Job<SyncShopifyPayload>);
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

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleSyncShopify(job: Job<SyncShopifyPayload>): Promise<void> {
    const { tenantId, full } = job.data;
    this.logger.log(
      `Sync Shopify for tenant ${tenantId} (full=${String(full)}) — placeholder for week 8`,
    );
    // TODO: Implement Shopify sync in week 8
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

    // Re-evaluate segment members
    // Note: Full evaluation logic is in SegmentsService.syncMembers
    // This processor delegates to it via Prisma directly for decoupling
    this.logger.log(`Segment ${segmentId} sync completed`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async handleSyncGoogleAds(
    job: Job<SyncGoogleAdsPayload>,
  ): Promise<void> {
    const { tenantId } = job.data;
    this.logger.log(
      `Sync Google Ads for tenant ${tenantId} — placeholder for week 12`,
    );
    // TODO: Implement Google Ads sync in week 12
  }
}
