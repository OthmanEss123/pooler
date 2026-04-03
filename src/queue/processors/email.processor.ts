import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailEventsService } from '../../modules/email-events/email-events.service';
import { EmailProviderService } from '../../modules/email-provider/email-provider.service';
import type { SendEmailPayload } from '../services/campaign-queue.service';

@Processor('email', { concurrency: 20 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailProvider: EmailProviderService,
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

      // Track SENT event via EmailEventsService
      // → updates campaign snapshot + contact status + ClickHouse mirror
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
      throw error; // BullMQ will retry
    }
  }
}
