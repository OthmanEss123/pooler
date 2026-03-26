import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailProviderService } from '../../modules/email-provider/email-provider.service';
import type { SendEmailPayload } from '../services/campaign-queue.service';

@Processor('email', { concurrency: 20 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProviderService,
  ) {
    super();
  }

  async process(job: Job<SendEmailPayload>): Promise<void> {
    const {
      campaignId,
      tenantId,
      contactId,
      contactEmail,
      subject,
      htmlContent,
      textContent,
      fromName,
      fromEmail,
      replyTo,
    } = job.data;

    this.logger.debug(
      `Sending email to ${contactEmail} for campaign ${campaignId}`,
    );

    try {
      const result = await this.emailProvider.sendEmail({
        to: contactEmail,
        subject,
        htmlBody: htmlContent,
        textBody: textContent,
        fromName,
        fromEmail,
        replyTo,
        tags: {
          campaignId,
          tenantId,
          contactId,
        },
      });

      // Create SENT event
      await this.prisma.emailEvent.create({
        data: {
          tenantId,
          campaignId,
          contactId,
          type: 'SENT',
          provider: result.provider,
          providerId: result.messageId,
        },
      });

      this.logger.debug(
        `Email sent to ${contactEmail} messageId=${result.messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${contactEmail}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error; // BullMQ will retry
    }
  }
}
