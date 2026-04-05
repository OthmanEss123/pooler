import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailEventsService } from '../../modules/email-events/email-events.service';
import { EmailProviderService } from '../../modules/email-provider/email-provider.service';
import { UnsubscribeService } from '../../modules/email-provider/unsubscribe.service';
import type { SendEmailPayload } from '../services/campaign-queue.service';

@Processor('email', { concurrency: 20 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProviderService,
    private readonly unsubscribeService: UnsubscribeService,
    private readonly emailEvents: EmailEventsService,
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

    const suppression = await this.prisma.globalSuppression.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: contactEmail.trim().toLowerCase(),
        },
      },
    });

    if (suppression) {
      this.logger.log(`Suppressed email skipped: ${contactEmail}`);
      return;
    }

    const unsubscribeUrl = this.unsubscribeService.buildUnsubscribeUrl(
      tenantId,
      contactId,
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
        unsubscribeUrl,
        tags: {
          campaignId,
          tenantId,
          contactId,
        },
      });

      await this.emailEvents.trackEvent(
        {
          campaignId,
          contactId,
          type: 'SENT',
          provider: result.provider,
          providerId: result.messageId,
          metadata: { email: contactEmail },
        },
        tenantId,
      );

      this.logger.debug(
        `Email sent to ${contactEmail} messageId=${result.messageId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${contactEmail}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      throw error;
    }
  }
}
