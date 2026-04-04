import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HealthScoreService } from '../insights/health-score.service';

type CampaignAssistResponse = {
  subjectSuggestions: string[];
  bodyHints: string[];
  recommendedSegment: string;
  bestSendTime: string;
  estimatedOpenRate: string;
  estimatedRevenue: number;
  reasoning: string;
};

type CampaignAgentResponse = Partial<CampaignAssistResponse>;

@Injectable()
export class CampaignAssistService {
  private readonly logger = new Logger(CampaignAssistService.name);
  private readonly paidStatuses = [OrderStatus.PAID, OrderStatus.FULFILLED];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly healthScoreService: HealthScoreService,
  ) {}

  async suggestCampaign(tenantId: string, goal: string) {
    const [segments, topProducts, healthScores, recentCampaigns, contacts] =
      await Promise.all([
        this.prisma.segment.findMany({
          where: {
            tenantId,
            contactCount: {
              gt: 0,
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 5,
          select: {
            id: true,
            name: true,
            type: true,
            contactCount: true,
          },
        }),
        this.getTopProducts(tenantId),
        this.healthScoreService.getDistribution(tenantId),
        this.prisma.campaign.findMany({
          where: { tenantId },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          select: {
            id: true,
            name: true,
            subject: true,
            status: true,
            totalSent: true,
            totalDelivered: true,
            totalOpened: true,
            revenue: true,
            createdAt: true,
          },
        }),
        this.prisma.contact.findMany({
          where: { tenantId },
          select: {
            totalRevenue: true,
          },
        }),
      ]);

    const averageLtv =
      contacts.length === 0
        ? 0
        : contacts.reduce(
            (sum, contact) => sum + Number(contact.totalRevenue ?? 0),
            0,
          ) / contacts.length;

    const estimatedRevenue = Number(
      (
        Math.max(segments[0]?.contactCount ?? contacts.length, 1) *
        averageLtv *
        0.05
      ).toFixed(2),
    );

    const context = {
      tenantId,
      goal,
      segments,
      topProducts,
      healthScores,
      recentCampaigns: recentCampaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        revenue: Number(campaign.revenue ?? 0),
        openRate:
          campaign.totalDelivered > 0
            ? Number(
                (
                  (campaign.totalOpened / campaign.totalDelivered) *
                  100
                ).toFixed(2),
              )
            : 0,
      })),
      averageLtv: Number(averageLtv.toFixed(2)),
      estimatedRevenue,
    };

    const agentResponse = await this.requestSuggestionFromAgent(
      tenantId,
      goal,
      context,
    );
    if (agentResponse) {
      return {
        subjectSuggestions: agentResponse.subjectSuggestions ?? [],
        bodyHints: agentResponse.bodyHints ?? [],
        recommendedSegment:
          agentResponse.recommendedSegment ??
          this.pickRecommendedSegment(healthScores),
        bestSendTime: agentResponse.bestSendTime ?? 'mardi 10h',
        estimatedOpenRate: agentResponse.estimatedOpenRate ?? '18-22%',
        estimatedRevenue:
          typeof agentResponse.estimatedRevenue === 'number'
            ? agentResponse.estimatedRevenue
            : estimatedRevenue,
        reasoning:
          agentResponse.reasoning ??
          'Suggestion generee a partir des performances recentes et de la distribution RFM.',
      } satisfies CampaignAssistResponse;
    }

    return this.buildFallbackSuggestion(
      goal,
      healthScores,
      topProducts,
      estimatedRevenue,
    );
  }

  private async getTopProducts(tenantId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const items = await this.prisma.orderItem.findMany({
      where: {
        tenantId,
        order: {
          status: {
            in: this.paidStatuses,
          },
          placedAt: {
            gte: since,
          },
        },
      },
      select: {
        name: true,
        quantity: true,
        totalPrice: true,
      },
    });

    const aggregates = new Map<
      string,
      {
        name: string;
        quantity: number;
        revenue: number;
      }
    >();

    for (const item of items) {
      const current = aggregates.get(item.name) ?? {
        name: item.name,
        quantity: 0,
        revenue: 0,
      };

      current.quantity += Number(item.quantity ?? 0);
      current.revenue += Number(item.totalPrice ?? 0);
      aggregates.set(item.name, current);
    }

    return [...aggregates.values()]
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5);
  }

  private pickRecommendedSegment(healthScores: Record<string, number>) {
    const atRisk = healthScores.AT_RISK ?? 0;
    const loyal = healthScores.LOYAL ?? 0;
    const champion = healthScores.CHAMPION ?? 0;

    if (atRisk >= loyal) {
      return 'AT_RISK';
    }

    if (loyal >= champion) {
      return 'LOYAL';
    }

    return 'CHAMPION';
  }

  private buildFallbackSuggestion(
    goal: string,
    healthScores: Record<string, number>,
    topProducts: Array<{ name: string }>,
    estimatedRevenue: number,
  ): CampaignAssistResponse {
    const recommendedSegment = this.pickRecommendedSegment(healthScores);
    const heroProduct = topProducts[0]?.name ?? 'vos best-sellers';

    return {
      subjectSuggestions: [
        `${goal} - offre exclusive cette semaine`,
        `On a prepare une relance autour de ${heroProduct}`,
        `Derniere chance pour revenir avant vendredi`,
      ],
      bodyHints: [
        'Commencer par une preuve sociale ou un chiffre recent fort.',
        'Mettre en avant un seul benefice principal et un CTA clair.',
        'Ajouter une urgence douce avec une fenetre de 48 a 72 heures.',
      ],
      recommendedSegment,
      bestSendTime: 'mardi 10h',
      estimatedOpenRate: '18-22%',
      estimatedRevenue,
      reasoning:
        'Fallback local base sur la distribution des health scores, les produits les plus rentables et la valeur moyenne client.',
    };
  }

  private async requestSuggestionFromAgent(
    tenantId: string,
    goal: string,
    context: Record<string, unknown>,
  ) {
    const explicitAgentUrl = process.env.NARRATIVE_AGENT_URL;
    const baseUrl =
      explicitAgentUrl ?? this.configService.get<string>('NARRATIVE_AGENT_URL');
    if (
      (process.env.NODE_ENV === 'test' && !explicitAgentUrl?.trim()) ||
      !baseUrl
    ) {
      return null;
    }

    try {
      const response = await fetch(`${baseUrl}/suggest-campaign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          goal,
          context,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Narrative agent returned ${response.status}`);
      }

      return (await response.json()) as CampaignAgentResponse;
    } catch (error) {
      this.logger.warn(
        `Campaign assist fallback for tenant=${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
