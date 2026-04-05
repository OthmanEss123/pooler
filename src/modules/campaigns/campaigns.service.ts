import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus, CampaignType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CampaignQueueService } from '../../queue/services/campaign-queue.service';
import { QuotaService } from '../billing/quota.service';
import { CreateAbTestDto } from './dto/create-ab-test.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignQueue: CampaignQueueService,
    private readonly quotaService: QuotaService,
  ) {}

  async create(tenantId: string, dto: CreateCampaignDto) {
    await this.ensureSegmentExists(tenantId, dto.segmentId);

    return this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        subject: dto.subject,
        previewText: dto.previewText,
        fromName: dto.fromName,
        fromEmail: dto.fromEmail,
        replyTo: dto.replyTo,
        htmlContent: dto.htmlContent,
        textContent: dto.textContent,
        segmentId: dto.segmentId,
        type: dto.type ?? CampaignType.REGULAR,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: CampaignStatus.DRAFT,
      },
      include: {
        segment: true,
        abTests: true,
      },
    });
  }

  async findAll(tenantId: string, status?: CampaignStatus) {
    return this.prisma.campaign.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        segment: true,
        abTests: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        segment: true,
        abTests: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async update(tenantId: string, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.findOne(tenantId, id);

    if (
      campaign.status === CampaignStatus.SENT ||
      campaign.status === CampaignStatus.SENDING
    ) {
      throw new BadRequestException('Cannot update a sent or sending campaign');
    }

    if (dto.segmentId) {
      await this.ensureSegmentExists(tenantId, dto.segmentId);
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.previewText !== undefined && { previewText: dto.previewText }),
        ...(dto.fromName !== undefined && { fromName: dto.fromName }),
        ...(dto.fromEmail !== undefined && { fromEmail: dto.fromEmail }),
        ...(dto.replyTo !== undefined && { replyTo: dto.replyTo }),
        ...(dto.htmlContent !== undefined && { htmlContent: dto.htmlContent }),
        ...(dto.textContent !== undefined && { textContent: dto.textContent }),
        ...(dto.segmentId !== undefined && { segmentId: dto.segmentId }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.scheduledAt !== undefined && {
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        }),
      },
      include: {
        segment: true,
        abTests: true,
      },
    });
  }

  async send(tenantId: string, id: string) {
    const campaign = await this.findOne(tenantId, id);

    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Campaign must be DRAFT or SCHEDULED');
    }

    this.campaignQueue.assertAvailable();

    const plannedEmails = await this.prisma.segmentMember.count({
      where: {
        segmentId: campaign.segmentId,
      },
    });

    await this.quotaService.checkEmailQuota(
      tenantId,
      Math.max(plannedEmails, 1),
    );

    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SENDING,
      },
    });

    try {
      await this.campaignQueue.sendCampaign(id, tenantId);
    } catch (error) {
      await this.prisma.campaign.update({
        where: { id },
        data: {
          status: campaign.status,
        },
      });

      throw error;
    }

    this.logger.log(`Campaign ${id} queued for sending`);

    return {
      message: 'Campaign queued for sending',
      campaignId: id,
      status: CampaignStatus.SENDING,
    };
  }

  async schedule(tenantId: string, id: string, scheduledAt: string) {
    const campaign = await this.findOne(tenantId, id);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT campaigns can be scheduled');
    }

    const scheduledDate = new Date(scheduledAt);
    const delayMs = scheduledDate.getTime() - Date.now();

    if (delayMs > 0) {
      this.campaignQueue.assertAvailable();
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt: scheduledDate,
      },
      include: {
        segment: true,
        abTests: true,
      },
    });

    if (delayMs > 0) {
      try {
        await this.campaignQueue.scheduleCampaign(id, tenantId, delayMs);
      } catch (error) {
        await this.prisma.campaign.update({
          where: { id },
          data: {
            status: campaign.status,
            scheduledAt: campaign.scheduledAt,
          },
        });

        throw error;
      }

      this.logger.log(
        `Campaign ${id} scheduled for ${scheduledDate.toISOString()}`,
      );
    }

    return updated;
  }

  async pause(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.PAUSED,
      },
      include: {
        segment: true,
        abTests: true,
      },
    });
  }

  async cancel(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.CANCELLED,
      },
      include: {
        segment: true,
        abTests: true,
      },
    });
  }

  async getStats(tenantId: string, id: string) {
    const campaign = await this.findOne(tenantId, id);

    const openRate =
      campaign.totalDelivered > 0
        ? (campaign.totalOpened / campaign.totalDelivered) * 100
        : 0;

    const clickRate =
      campaign.totalDelivered > 0
        ? (campaign.totalClicked / campaign.totalDelivered) * 100
        : 0;

    const revenuePerEmail =
      campaign.totalDelivered > 0
        ? Number(campaign.revenue) / campaign.totalDelivered
        : 0;

    return {
      campaignId: campaign.id,
      totalSent: campaign.totalSent,
      totalDelivered: campaign.totalDelivered,
      totalOpened: campaign.totalOpened,
      totalClicked: campaign.totalClicked,
      totalBounced: campaign.totalBounced,
      totalUnsubscribed: campaign.totalUnsubscribed,
      totalComplained: campaign.totalComplained,
      revenue: Number(campaign.revenue),
      openRate,
      clickRate,
      revenuePerEmail,
    };
  }

  async addAbTestVariant(
    tenantId: string,
    campaignId: string,
    dto: CreateAbTestDto,
  ) {
    const campaign = await this.findOne(tenantId, campaignId);

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new BadRequestException(
        'A/B variants can only be added to DRAFT campaigns',
      );
    }

    return this.prisma.abTest.create({
      data: {
        campaignId,
        variantName: dto.variantName,
        subject: dto.subject,
        htmlContent: dto.htmlContent,
        splitPercent: dto.splitPercent,
      },
    });
  }

  async pickAbTestWinner(
    tenantId: string,
    campaignId: string,
    variantId: string,
  ) {
    await this.findOne(tenantId, campaignId);

    const variant = await this.prisma.abTest.findFirst({
      where: {
        id: variantId,
        campaignId,
      },
    });

    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    await this.prisma.$transaction([
      this.prisma.abTest.updateMany({
        where: { campaignId },
        data: { isWinner: false },
      }),
      this.prisma.abTest.update({
        where: { id: variantId },
        data: { isWinner: true },
      }),
    ]);

    return this.prisma.abTest.findUnique({
      where: { id: variantId },
    });
  }

  async remove(tenantId: string, id: string) {
    const campaign = await this.findOne(tenantId, id);

    if (campaign.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Cannot delete a sending campaign');
    }

    await this.prisma.campaign.delete({
      where: { id },
    });
  }

  private async ensureSegmentExists(tenantId: string, segmentId: string) {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id: segmentId,
        tenantId,
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }
  }
}
