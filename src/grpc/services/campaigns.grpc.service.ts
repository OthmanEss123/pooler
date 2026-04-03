import { Injectable } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class CampaignsGrpcService {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('CampaignsService', 'GetCampaignStats')
  async getCampaignStats(data: { tenantId: string; campaignId: string }) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: data.campaignId,
        tenantId: data.tenantId,
      },
      select: {
        id: true,
        totalSent: true,
        totalOpened: true,
        totalClicked: true,
        revenue: true,
      },
    });

    if (!campaign) {
      return {
        campaignId: data.campaignId,
        sent: 0,
        opened: 0,
        clicked: 0,
        revenue: 0,
      };
    }

    return {
      campaignId: campaign.id,
      sent: campaign.totalSent ?? 0,
      opened: campaign.totalOpened ?? 0,
      clicked: campaign.totalClicked ?? 0,
      revenue: Number(campaign.revenue ?? 0),
    };
  }

  @GrpcMethod('CampaignsService', 'UpdateCampaignMetrics')
  async updateCampaignMetrics(data: {
    tenantId: string;
    campaignId: string;
    sent: number;
    opened: number;
    clicked: number;
    revenue: number;
  }) {
    const updated = await this.prisma.campaign.updateMany({
      where: {
        id: data.campaignId,
        tenantId: data.tenantId,
      },
      data: {
        totalSent: data.sent,
        totalOpened: data.opened,
        totalClicked: data.clicked,
        revenue: data.revenue,
      },
    });

    return {
      status: updated.count > 0 ? 'updated' : 'not_found',
    };
  }
}
