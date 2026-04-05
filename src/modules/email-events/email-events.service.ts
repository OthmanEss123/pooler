import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EmailEventType, Prisma, SuppressionReason } from '@prisma/client';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TrackEmailEventDto } from './dto/track-email-event.dto';

const toInputJsonValue = (
  value?: Record<string, unknown>,
): Prisma.InputJsonValue | undefined =>
  value
    ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
    : undefined;

const getMetadataNumber = (
  metadata: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = metadata?.[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
};

const getMetadataString = (
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const normalizeOccurredAt = (occurredAt: string): string => {
  const parsed = new Date(occurredAt);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
};

@Injectable()
export class EmailEventsService {
  private readonly logger = new Logger(EmailEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickhouseService,
  ) {}

  async trackEvent(dto: TrackEmailEventDto, tenantId?: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: dto.campaignId,
        ...(tenantId ? { tenantId } : {}),
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const contact = await this.prisma.contact.findFirst({
      where: {
        id: dto.contactId,
        tenantId: campaign.tenantId,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    if (dto.type !== EmailEventType.SENT) {
      const existing = await this.prisma.emailEvent.findFirst({
        where: {
          tenantId: campaign.tenantId,
          contactId: dto.contactId,
          campaignId: dto.campaignId,
          type: dto.type,
        },
      });

      if (existing) {
        return existing;
      }
    }

    const campaignUpdates: Record<string, { increment: number }> = {};

    switch (dto.type) {
      case EmailEventType.SENT:
        campaignUpdates.totalSent = { increment: 1 };
        break;
      case EmailEventType.DELIVERED:
        campaignUpdates.totalDelivered = { increment: 1 };
        break;
      case EmailEventType.OPENED:
        campaignUpdates.totalOpened = { increment: 1 };
        break;
      case EmailEventType.CLICKED:
        campaignUpdates.totalClicked = { increment: 1 };
        break;
      case EmailEventType.BOUNCED:
        campaignUpdates.totalBounced = { increment: 1 };
        break;
      case EmailEventType.UNSUBSCRIBED:
        campaignUpdates.totalUnsubscribed = { increment: 1 };
        break;
      case EmailEventType.COMPLAINED:
        campaignUpdates.totalComplained = { increment: 1 };
        break;
    }

    const emailEvent = await this.prisma.$transaction(async (tx) => {
      const createdEmailEvent = await tx.emailEvent.create({
        data: {
          tenantId: campaign.tenantId,
          campaignId: dto.campaignId,
          contactId: dto.contactId,
          type: dto.type,
          provider: dto.provider,
          providerId: dto.providerId,
          metadata: toInputJsonValue(dto.metadata),
        },
      });

      if (Object.keys(campaignUpdates).length > 0) {
        await tx.campaign.update({
          where: { id: dto.campaignId },
          data: campaignUpdates,
        });
      }

      if (dto.type === EmailEventType.UNSUBSCRIBED) {
        await tx.contact.update({
          where: { id: dto.contactId },
          data: {
            emailStatus: 'UNSUBSCRIBED',
            subscribed: false,
            unsubscribedAt: new Date(),
          },
        });
      }

      if (dto.type === EmailEventType.BOUNCED) {
        await tx.contact.update({
          where: { id: dto.contactId },
          data: {
            emailStatus: 'BOUNCED',
            bouncedAt: new Date(),
          },
        });
      }

      if (dto.type === EmailEventType.COMPLAINED) {
        await tx.contact.update({
          where: { id: dto.contactId },
          data: {
            emailStatus: 'COMPLAINED',
            complainedAt: new Date(),
          },
        });
      }

      return createdEmailEvent;
    });

    if (contact.email) {
      if (dto.type === EmailEventType.UNSUBSCRIBED) {
        await this.syncSuppression(
          campaign.tenantId,
          contact.email,
          SuppressionReason.UNSUBSCRIBED,
        );
      }

      if (dto.type === EmailEventType.BOUNCED) {
        await this.syncSuppression(
          campaign.tenantId,
          contact.email,
          SuppressionReason.BOUNCED,
        );
      }

      if (dto.type === EmailEventType.COMPLAINED) {
        await this.syncSuppression(
          campaign.tenantId,
          contact.email,
          SuppressionReason.COMPLAINED,
        );
      }
    }

    const revenue =
      dto.revenue ?? getMetadataNumber(dto.metadata, 'revenue') ?? 0;
    const occurredAt = normalizeOccurredAt(
      dto.occurredAt ??
        getMetadataString(dto.metadata, 'occurredAt') ??
        emailEvent.createdAt.toISOString(),
    );

    if (
      process.env.NODE_ENV === 'test' &&
      typeof this.clickhouse.insert !== 'function'
    ) {
      return emailEvent;
    }

    try {
      await this.clickhouse.insert('email_events_log', [
        {
          tenant_id: campaign.tenantId,
          campaign_id: dto.campaignId,
          contact_id: dto.contactId,
          type: dto.type,
          revenue,
          event_date: occurredAt.slice(0, 10),
          occurred_at: occurredAt,
        },
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to mirror email event ${dto.type} for campaign=${dto.campaignId} into ClickHouse`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return emailEvent;
  }

  async getEventsByContact(tenantId: string, contactId: string) {
    return this.prisma.emailEvent.findMany({
      where: {
        tenantId,
        contactId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getEventsByCampaign(tenantId: string, campaignId: string) {
    return this.prisma.emailEvent.findMany({
      where: {
        tenantId,
        campaignId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        contact: true,
      },
    });
  }

  private async syncSuppression(
    tenantId: string,
    email: string,
    reason: SuppressionReason,
  ) {
    await this.prisma.globalSuppression.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.trim().toLowerCase(),
        },
      },
      update: { reason },
      create: {
        tenantId,
        email: email.trim().toLowerCase(),
        reason,
      },
    });
  }
}
