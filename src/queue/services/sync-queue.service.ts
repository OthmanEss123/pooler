import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface SyncShopifyPayload {
  tenantId: string;
  full: boolean;
}

export interface SyncSegmentPayload {
  tenantId: string;
  segmentId: string;
}

export interface SyncGoogleAdsPayload {
  tenantId: string;
}

@Injectable()
export class SyncQueueService {
  constructor(@InjectQueue('sync') private readonly syncQueue: Queue) {}

  async syncShopify(tenantId: string, full = false) {
    return this.syncQueue.add(
      'sync-shopify',
      { tenantId, full } satisfies SyncShopifyPayload,
      { jobId: `shopify-${tenantId}-${Date.now()}` },
    );
  }

  async syncSegment(tenantId: string, segmentId: string) {
    return this.syncQueue.add(
      'sync-segment',
      { tenantId, segmentId } satisfies SyncSegmentPayload,
      { jobId: `segment-${segmentId}-${Date.now()}` },
    );
  }

  async syncGoogleAds(tenantId: string) {
    return this.syncQueue.add(
      'sync-google-ads',
      { tenantId } satisfies SyncGoogleAdsPayload,
      { jobId: `google-ads-${tenantId}-${Date.now()}` },
    );
  }
}
