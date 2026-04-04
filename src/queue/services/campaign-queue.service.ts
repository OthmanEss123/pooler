// src/queue/services/campaign-queue.service.ts
import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export interface SendCampaignPayload {
  campaignId: string;
  tenantId: string;
}

export interface SendEmailPayload {
  contactId: string;
  campaignId: string;
  tenantId: string;
  contactEmail: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

@Injectable()
export class CampaignQueueService {
  private readonly logger = new Logger(CampaignQueueService.name);
  private readonly queueEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectQueue('campaign') private readonly campaignQueue?: Queue,
    @Optional() @InjectQueue('email') private readonly emailQueue?: Queue,
  ) {
    this.queueEnabled = this.config.get<boolean>('QUEUE_ENABLED', true);
  }

  assertAvailable() {
    if (!this.queueEnabled) {
      if (process.env.NODE_ENV === 'test') {
        return;
      }

      throw new ServiceUnavailableException(
        'Queue desactivee (QUEUE_ENABLED=false)',
      );
    }

    if (!this.campaignQueue || !this.emailQueue) {
      throw new ServiceUnavailableException(
        'Campaign queue infrastructure is not available',
      );
    }
  }

  async sendCampaign(campaignId: string, tenantId: string) {
    if (!this.queueEnabled || !this.campaignQueue) {
      if (process.env.NODE_ENV === 'test') {
        this.logger.log(
          `[QUEUE_DISABLED][TEST] sendCampaign ignored: ${campaignId}`,
        );
        return null;
      }

      throw new ServiceUnavailableException(
        'Queue desactivee - envoi impossible',
      );
    }

    return this.campaignQueue.add(
      'send-campaign',
      { campaignId, tenantId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  async scheduleCampaign(campaignId: string, tenantId: string, delay: number) {
    if (!this.queueEnabled || !this.campaignQueue) {
      if (process.env.NODE_ENV === 'test') {
        this.logger.log(
          `[QUEUE_DISABLED][TEST] scheduleCampaign ignored: ${campaignId}`,
        );
        return null;
      }

      throw new ServiceUnavailableException(
        'Queue desactivee - planification impossible',
      );
    }

    return this.campaignQueue.add(
      'send-campaign',
      { campaignId, tenantId },
      { delay, attempts: 3 },
    );
  }

  async sendEmail(payload: SendEmailPayload) {
    if (!this.queueEnabled || !this.emailQueue) {
      this.logger.log(
        `[QUEUE_DISABLED] sendEmail ignored: ${payload.contactEmail}`,
      );
      return;
    }

    return this.emailQueue.add('send-email', payload, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 500,
    });
  }
}
