import { Injectable } from '@nestjs/common';
import { CampaignStatus, EmailEventType, FlowStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      tenantsActive,
      contactsTotal,
      campaignsSent30d,
      emailsSent30d,
      flowsActive,
      insightsUnread,
    ] = await Promise.all([
      this.prisma.tenant.count({
        where: { isActive: true },
      }),
      this.prisma.contact.count(),
      this.prisma.campaign.count({
        where: {
          status: CampaignStatus.SENT,
          sentAt: {
            gte: since30Days,
          },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          type: EmailEventType.SENT,
          createdAt: {
            gte: since30Days,
          },
        },
      }),
      this.prisma.flow.count({
        where: {
          status: FlowStatus.ACTIVE,
        },
      }),
      this.prisma.insight.count({
        where: {
          isRead: false,
        },
      }),
    ]);

    return {
      tenantsActive,
      contactsTotal,
      campaignsSent30d,
      emailsSent30d,
      flowsActive,
      insightsUnread,
    };
  }
}
