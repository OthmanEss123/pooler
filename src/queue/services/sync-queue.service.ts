// src/queue/services/sync-queue.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SyncQueueService {
  private readonly logger = new Logger(SyncQueueService.name);
  private readonly isTest = process.env.NODE_ENV === 'test';

  constructor(
    @InjectQueue('sync') private readonly syncQueue?: Queue,
  ) {}

  async syncShopify(tenantId: string, full = false) {
    if (this.isTest) return;
    return this.syncQueue!.add(
      'sync-shopify',
      { tenantId, full },
      { attempts: 3, backoff: { type: 'fixed', delay: 10000 } },
    );
  }

  async syncGoogleAds(tenantId: string) {
    if (this.isTest) return;
    return this.syncQueue!.add(
      'sync-google-ads',
      { tenantId },
      { attempts: 3 },
    );
  }

  async syncSegment(tenantId: string, segmentId: string) {
    if (this.isTest) return;
    return this.syncQueue!.add(
      'sync-segment',
      { tenantId, segmentId },
      { attempts: 2 },
    );
  }
}