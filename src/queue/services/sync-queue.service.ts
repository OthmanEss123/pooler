import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export interface SyncShopifyPayload {
  tenantId: string;
  full: boolean;
}

export interface SyncWoocommercePayload {
  tenantId: string;
  full: boolean;
}

export interface SyncSegmentPayload {
  tenantId: string;
  segmentId: string;
}

export interface SyncGoogleAdsPayload {
  tenantId: string;
  campaignId?: string;
  date?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

@Injectable()
export class SyncQueueService {
  private readonly logger = new Logger(SyncQueueService.name);
  private readonly queueEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectQueue('sync') private readonly syncQueue?: Queue,
  ) {
    this.queueEnabled = this.config.get<boolean>('QUEUE_ENABLED', true);
  }

  assertAvailable() {
    if (!this.queueEnabled) {
      return;
    }

    if (!this.syncQueue) {
      throw new ServiceUnavailableException(
        'Sync queue infrastructure is not available',
      );
    }
  }

  async syncShopify(tenantId: string, full = false) {
    if (!this.queueEnabled || !this.syncQueue) {
      this.logger.log(`[QUEUE_DISABLED] syncShopify ignored: ${tenantId}`);
      return;
    }

    return this.syncQueue.add(
      'sync-shopify',
      { tenantId, full },
      { attempts: 3, backoff: { type: 'fixed', delay: 10000 } },
    );
  }

  async syncWoocommerce(tenantId: string, full = false) {
    if (!this.queueEnabled || !this.syncQueue) {
      this.logger.log(`[QUEUE_DISABLED] syncWoocommerce ignored: ${tenantId}`);
      return;
    }

    return this.syncQueue.add(
      'sync-woocommerce',
      { tenantId, full },
      {
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  async syncGoogleAds(payload: SyncGoogleAdsPayload | string) {
    if (!this.queueEnabled || !this.syncQueue) {
      const tenantId = typeof payload === 'string' ? payload : payload.tenantId;
      this.logger.log(`[QUEUE_DISABLED] syncGoogleAds ignored: ${tenantId}`);
      return;
    }

    const jobPayload =
      typeof payload === 'string' ? { tenantId: payload } : payload;

    return this.syncQueue.add('sync-google-ads', jobPayload, { attempts: 3 });
  }

  async syncSegment(tenantId: string, segmentId: string) {
    if (!this.queueEnabled || !this.syncQueue) {
      this.logger.log(`[QUEUE_DISABLED] syncSegment ignored: ${segmentId}`);
      return;
    }

    return this.syncQueue.add(
      'sync-segment',
      { tenantId, segmentId },
      { attempts: 2 },
    );
  }
}
