import { Injectable } from '@nestjs/common';
import { AdCampaignStatus, InsightType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class AdIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }

  private async hasRecentInsight(
    tenantId: string,
    type: InsightType,
    campaignId?: string,
    uniqueKey?: string,
  ) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const insights = await this.prisma.insight.findMany({
      where: {
        tenantId,
        type,
        createdAt: { gte: since },
      },
      select: { data: true },
    });

    return insights.some((insight) => {
      if (
        !insight.data ||
        typeof insight.data !== 'object' ||
        Array.isArray(insight.data)
      ) {
        return false;
      }

      const data = insight.data as Record<string, unknown>;
      if (campaignId && data.campaignId === campaignId) {
        return true;
      }
      if (uniqueKey && data.uniqueKey === uniqueKey) {
        return true;
      }
      return false;
    });
  }

  async detectWastedSpend(tenantId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        tenantId,
        status: AdCampaignStatus.ENABLED,
        syncedAt: { gte: since },
      },
    });

    let created = 0;

    for (const campaign of campaigns) {
      const spend = this.toNumber(campaign.spend);
      const conversionValue = this.toNumber(campaign.conversionValue);
      const roas = this.toNumber(campaign.roas);
      const clicks = Number(campaign.clicks ?? 0);
      const conversions = this.toNumber(campaign.conversions);

      if (spend > 100 && roas < 1) {
        const exists = await this.hasRecentInsight(
          tenantId,
          InsightType.AD_WASTE,
          campaign.id,
        );
        if (exists) {
          continue;
        }

        await this.prisma.insight.create({
          data: {
            tenantId,
            type: InsightType.AD_WASTE,
            title: `Campagne '${campaign.name}' perd de l'argent`,
            description: `${spend}$ d�pens�s, ${conversionValue}$ g�n�r�s. ROAS: ${roas}.`,
            impact: spend - conversionValue,
            data: {
              campaignId: campaign.id,
              spend,
              roas,
              conversionValue,
            },
          },
        });
        created += 1;
      }

      if (spend > 100 && conversions <= 0 && clicks < 10) {
        const exists = await this.hasRecentInsight(
          tenantId,
          InsightType.AD_WASTE,
          campaign.id,
        );
        if (exists) {
          continue;
        }

        await this.prisma.insight.create({
          data: {
            tenantId,
            type: InsightType.AD_WASTE,
            title: `Campagne '${campaign.name}' sans conversions`,
            description:
              'Aucune conversion track�e r�cemment malgr� de la d�pense.',
            impact: spend,
            data: {
              campaignId: campaign.id,
              spend,
              roas,
              clicks,
              conversions,
            },
          },
        });
        created += 1;
      }
    }

    return created;
  }

  async detectBudgetOpportunities(tenantId: string) {
    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        tenantId,
        status: AdCampaignStatus.ENABLED,
      },
    });

    let created = 0;

    for (const campaign of campaigns) {
      const roas = this.toNumber(campaign.roas);
      const conversions = this.toNumber(campaign.conversions);

      if (roas > 4 && conversions > 10) {
        const exists = await this.hasRecentInsight(
          tenantId,
          InsightType.SEGMENT_OPPORTUNITY,
          campaign.id,
        );
        if (exists) {
          continue;
        }

        await this.prisma.insight.create({
          data: {
            tenantId,
            type: InsightType.SEGMENT_OPPORTUNITY,
            title: `Augmenter le budget de '${campaign.name}'`,
            description: `ROAS ${roas} avec ${conversions} conversions. Cette campagne semble pouvoir scaler.`,
            data: {
              campaignId: campaign.id,
              roas,
              conversions,
            },
          },
        });
        created += 1;
      }
    }

    return created;
  }

  async detectAudienceOverlap(tenantId: string) {
    const audiences = await this.prisma.adAudience.findMany({
      where: { tenantId },
      include: {
        members: { select: { contactId: true } },
      },
    });

    let created = 0;

    for (let index = 0; index < audiences.length; index += 1) {
      for (
        let compareIndex = index + 1;
        compareIndex < audiences.length;
        compareIndex += 1
      ) {
        const audienceA = audiences[index];
        const audienceB = audiences[compareIndex];

        const membersA = new Set(
          audienceA.members.map((member) => member.contactId),
        );
        const membersB = new Set(
          audienceB.members.map((member) => member.contactId),
        );

        if (membersA.size === 0 || membersB.size === 0) {
          continue;
        }

        let overlapCount = 0;
        for (const id of membersA) {
          if (membersB.has(id)) {
            overlapCount += 1;
          }
        }

        const base = Math.min(membersA.size, membersB.size);
        const overlap = base > 0 ? (overlapCount / base) * 100 : 0;

        if (overlap <= 50) {
          continue;
        }

        const uniqueKey = `audience-overlap:${[audienceA.id, audienceB.id].sort().join(':')}`;
        const exists = await this.hasRecentInsight(
          tenantId,
          InsightType.AD_WASTE,
          undefined,
          uniqueKey,
        );
        if (exists) {
          continue;
        }

        await this.prisma.insight.create({
          data: {
            tenantId,
            type: InsightType.AD_WASTE,
            title: 'Audiences qui se chevauchent',
            description: `${audienceA.name} et ${audienceB.name} ont ${overlap.toFixed(2)}% de contacts en commun.`,
            data: {
              audienceAId: audienceA.id,
              audienceBId: audienceB.id,
              overlap,
              uniqueKey,
            },
          },
        });
        created += 1;
      }
    }

    return created;
  }

  async runFullAnalysis(tenantId: string) {
    const [waste, budget, overlap] = await Promise.all([
      this.detectWastedSpend(tenantId),
      this.detectBudgetOpportunities(tenantId),
      this.detectAudienceOverlap(tenantId),
    ]);

    return { waste, budget, overlap, total: waste + budget + overlap };
  }
}
