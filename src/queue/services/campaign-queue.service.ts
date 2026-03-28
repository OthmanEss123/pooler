// src/queue/services/campaign-queue.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CampaignQueueService {
  private readonly logger = new Logger(CampaignQueueService.name);
  private readonly isTest = process.env.NODE_ENV === 'test';

  constructor(
    @InjectQueue('campaign') private readonly campaignQueue?: Queue,
    @InjectQueue('email')    private readonly emailQueue?: Queue,
  ) {}

  async sendCampaign(campaignId: string, tenantId: string) {
    if (this.isTest) {
      this.logger.log(`[TEST] sendCampaign simulé: ${campaignId}`);
      return;
    }
    return this.campaignQueue!.add(
      'send-campaign',
      { campaignId, tenantId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
  }

  async scheduleCampaign(campaignId: string, tenantId: string, delay: number) {
    if (this.isTest) return;
    return this.campaignQueue!.add(
      'send-campaign',
      { campaignId, tenantId },
      { delay, attempts: 3 },
    );
  }

  async sendEmail(payload: {
    contactId:   string;
    campaignId:  string;
    tenantId:    string;
    email:       string;
    subject:     string;
    htmlContent: string;
    fromEmail:   string;
    fromName:    string;
  }) {
    if (this.isTest) {
      this.logger.log(`[TEST] sendEmail simulé: ${payload.email}`);
      return;
    }
    return this.emailQueue!.add('send-email', payload, {
      attempts:          5,
      backoff:           { type: 'exponential', delay: 2000 },
      removeOnComplete:  1000,
      removeOnFail:      500,
    });
  }
}