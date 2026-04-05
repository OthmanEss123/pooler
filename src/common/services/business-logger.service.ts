import { Injectable, Logger } from '@nestjs/common';

export type BusinessEvent =
  | 'campaign.sent'
  | 'campaign.failed'
  | 'flow.triggered'
  | 'flow.completed'
  | 'flow.failed'
  | 'flow.recovered'
  | 'sync.shopify.completed'
  | 'sync.shopify.failed'
  | 'sync.woocommerce.completed'
  | 'sync.google_ads.completed'
  | 'email.sent'
  | 'email.bounced'
  | 'email.complained'
  | 'contact.imported'
  | 'quota.exceeded';

export interface BusinessLogPayload {
  tenantId: string;
  event: BusinessEvent;
  entityId?: string;
  count?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class BusinessLoggerService {
  private readonly logger = new Logger('Business');

  log(payload: BusinessLogPayload) {
    const { event, tenantId, entityId, count, error, metadata } = payload;

    if (error) {
      this.logger.error({
        event,
        tenantId,
        entityId,
        count,
        error,
        metadata,
      });
      return;
    }

    this.logger.log({
      event,
      tenantId,
      entityId,
      count,
      metadata,
    });
  }

  campaignSent(tenantId: string, campaignId: string, count: number) {
    this.log({
      tenantId,
      count,
      event: 'campaign.sent',
      entityId: campaignId,
      metadata: { emailsEnqueued: count },
    });
  }

  flowTriggered(tenantId: string, flowId: string, contactId: string) {
    this.log({
      tenantId,
      event: 'flow.triggered',
      entityId: flowId,
      metadata: { contactId },
    });
  }

  flowFailed(tenantId: string, executionId: string, error: string) {
    this.log({
      tenantId,
      error,
      event: 'flow.failed',
      entityId: executionId,
    });
  }

  syncCompleted(
    tenantId: string,
    source: 'shopify' | 'woocommerce' | 'google_ads',
    count: number,
  ) {
    this.log({
      tenantId,
      count,
      event: `sync.${source}.completed` as BusinessEvent,
      metadata: { synced: count },
    });
  }
}
