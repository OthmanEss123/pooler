import { Injectable, NotFoundException } from '@nestjs/common';
import { EmailEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TrackEmailEventDto } from './dto/track-email-event.dto';

const toInputJsonValue = (
  value?: Record<string, unknown>,
): Prisma.InputJsonValue | undefined =>
  value
    ? (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
    : undefined;

@Injectable()
export class EmailEventsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.$transaction(async (tx) => {
      const emailEvent = await tx.emailEvent.create({
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
          data: { emailStatus: 'UNSUBSCRIBED' },
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

      return emailEvent;
    });
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
}
