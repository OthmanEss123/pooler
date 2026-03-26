import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface SendCampaignPayload {
  campaignId: string;
  tenantId: string;
}

export interface SendEmailPayload {
  campaignId: string;
  tenantId: string;
  contactId: string;
  contactEmail: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

@Injectable()
export class CampaignQueueService {
  constructor(
    @InjectQueue('campaign') private readonly campaignQueue: Queue,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  async sendCampaign(campaignId: string, tenantId: string) {
    return this.campaignQueue.add(
      'send-campaign',
      { campaignId, tenantId } satisfies SendCampaignPayload,
      { jobId: `campaign-${campaignId}` },
    );
  }

  async scheduleCampaign(
    campaignId: string,
    tenantId: string,
    delayMs: number,
  ) {
    return this.campaignQueue.add(
      'send-campaign',
      { campaignId, tenantId } satisfies SendCampaignPayload,
      {
        jobId: `campaign-scheduled-${campaignId}`,
        delay: delayMs,
      },
    );
  }

  async sendEmail(payload: SendEmailPayload) {
    return this.emailQueue.add('send-email', payload, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    });
  }
}
