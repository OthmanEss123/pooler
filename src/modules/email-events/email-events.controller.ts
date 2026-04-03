import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TrackEmailEventDto } from './dto/track-email-event.dto';
import type {
  SesNotificationPayload,
  SnsMessage,
} from './dto/ses-notification.dto';
import { EmailEventsService } from './email-events.service';

const SES_EVENT_MAP: Record<string, string> = {
  Delivery: 'DELIVERED',
  Open: 'OPENED',
  Click: 'CLICKED',
  Bounce: 'BOUNCED',
  Complaint: 'COMPLAINED',
};

@Controller('email-events')
export class EmailEventsController {
  private readonly logger = new Logger(EmailEventsController.name);

  constructor(private readonly emailEventsService: EmailEventsService) {}

  @Get('contact/:contactId')
  getEventsByContact(
    @CurrentTenant() tenantId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.emailEventsService.getEventsByContact(tenantId, contactId);
  }

  @Get('campaign/:campaignId')
  getEventsByCampaign(
    @CurrentTenant() tenantId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.emailEventsService.getEventsByCampaign(tenantId, campaignId);
  }

  @Public()
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Body() dto: TrackEmailEventDto) {
    return this.emailEventsService.trackEvent(dto);
  }

  @Public()
  @Throttle({ webhook: { limit: 200, ttl: 60000 } })
  @Post('ses-webhook')
  @HttpCode(HttpStatus.OK)
  async sesWebhook(
    @Headers('x-amz-sns-message-type') messageType: string | undefined,
    @Body() body: SnsMessage | Record<string, unknown>,
  ) {
    if (messageType === 'SubscriptionConfirmation') {
      const snsBody = body as SnsMessage;
      this.logger.log(
        `SNS SubscriptionConfirmation - confirm URL: ${snsBody.SubscribeURL ?? 'N/A'}`,
      );
      return { ok: true, message: 'SubscriptionConfirmation received' };
    }

    if (messageType === 'Notification') {
      const snsBody = body as SnsMessage;
      let payload: SesNotificationPayload;

      try {
        payload = JSON.parse(snsBody.Message) as SesNotificationPayload;
      } catch {
        this.logger.warn('Failed to parse SNS Message body');
        return { ok: false, message: 'Invalid SNS message body' };
      }

      return this.handleSesEvent(payload);
    }

    if ('notificationType' in body || 'eventType' in body) {
      return this.handleSesEvent(body as unknown as SesNotificationPayload);
    }

    this.logger.debug(
      `Unhandled webhook message type: ${messageType ?? 'none'}`,
    );
    return { ok: true };
  }

  private async handleSesEvent(payload: SesNotificationPayload) {
    const eventType =
      payload.eventType ?? payload.notificationType ?? 'Unknown';
    const mappedType = SES_EVENT_MAP[eventType];

    if (!mappedType) {
      this.logger.debug(`Ignoring SES event type: ${eventType}`);
      return { ok: true, ignored: true };
    }

    const tags = payload.mail.tags ?? [];
    const getTag = (name: string): string | undefined =>
      tags.find((tag) => tag.name === name)?.value[0];

    const campaignId = getTag('campaignId');
    const tenantId = getTag('tenantId');
    const contactId = getTag('contactId');

    if (!campaignId || !contactId) {
      this.logger.warn(
        `SES event ${eventType} missing required tags (campaignId=${campaignId ?? 'N/A'}, contactId=${contactId ?? 'N/A'})`,
      );
      return { ok: false, message: 'Missing required tags' };
    }

    try {
      await this.emailEventsService.trackEvent(
        {
          campaignId,
          contactId,
          type: mappedType as TrackEmailEventDto['type'],
          provider: 'ses',
          providerId: payload.mail.messageId,
        },
        tenantId,
      );

      this.logger.debug(
        `Tracked SES event: ${mappedType} campaign=${campaignId} contact=${contactId}`,
      );

      return { ok: true, eventType: mappedType };
    } catch (error) {
      this.logger.error(
        `Failed to track SES event: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return { ok: false, message: 'Failed to track event' };
    }
  }
}
