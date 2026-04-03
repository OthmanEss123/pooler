import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CampaignQueueService,
  type SendCampaignPayload,
} from '../services/campaign-queue.service';

@Processor('campaign')
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignQueue: CampaignQueueService,
  ) {
    super();
  }

  async process(job: Job<SendCampaignPayload>): Promise<void> {
    const { campaignId, tenantId } = job.data;
    this.logger.log(`Processing campaign ${campaignId} for tenant ${tenantId}`);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: { segment: true },
    });

    if (!campaign) {
      this.logger.warn(`Campaign ${campaignId} not found, skipping`);
      return;
    }

    if (campaign.status !== 'SENDING') {
      this.logger.warn(
        `Campaign ${campaignId} status is ${campaign.status}, skipping`,
      );
      return;
    }

    // Fetch subscribed contacts from the segment
    const members = await this.prisma.segmentMember.findMany({
      where: { segmentId: campaign.segmentId },
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            emailStatus: true,
          },
        },
      },
    });

    const subscribedContacts = members.filter(
      (m) =>
        m.contact.emailStatus === 'SUBSCRIBED' ||
        m.contact.emailStatus === 'PENDING',
    );

    this.logger.log(
      `Enqueuing ${subscribedContacts.length} emails for campaign ${campaignId}`,
    );

    // Update totalSent counter while still SENDING
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { totalSent: subscribedContacts.length },
    });

    // Enqueue individual email jobs
    for (const member of subscribedContacts) {
      await this.campaignQueue.sendEmail({
        campaignId,
        tenantId,
        contactId: member.contact.id,
        contactEmail: member.contact.email,
        subject: campaign.subject,
        htmlContent: campaign.htmlContent,
        textContent: campaign.textContent ?? undefined,
        fromName: campaign.fromName,
        fromEmail: campaign.fromEmail,
        replyTo: campaign.replyTo ?? undefined,
      });
    }

    // Mark SENT only after ALL email jobs are enqueued
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    this.logger.log(
      `Campaign ${campaignId} completed — ${subscribedContacts.length} emails enqueued`,
    );
  }
}
