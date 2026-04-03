import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailEventType, InsightType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

type NarrativeResponse = {
  narrative?: string;
};

type AskResponse = {
  answer?: string;
  reasoning?: string | null;
  actions?: unknown[];
};

@Injectable()
export class CopilotService {
  private readonly postPurchaseStatuses = [
    OrderStatus.PAID,
    OrderStatus.FULFILLED,
  ] as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private getAgentUrl() {
    return (
      this.configService.get<string>('NARRATIVE_AGENT_URL') ??
      'http://localhost:8001'
    );
  }

  private getTodayKey(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    return `narrative:${tenantId}:${today}`;
  }

  async getNarrative(tenantId: string) {
    const key = this.getTodayKey(tenantId);
    const cached = await this.redisService.get(key);

    if (cached) {
      return {
        narrative: cached,
        generatedAt: new Date().toISOString(),
        cached: true,
      };
    }

    const narrative = await this.generateNarrative(tenantId);
    return {
      narrative,
      generatedAt: new Date().toISOString(),
      cached: false,
    };
  }

  async generateNarrative(tenantId: string) {
    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const [
      insights,
      campaigns,
      orders,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
    ] = await Promise.all([
      this.prisma.insight.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.adCampaign.findMany({
        where: { tenantId },
        orderBy: { spend: 'desc' },
        take: 10,
      }),
      this.prisma.order.findMany({
        where: {
          contact: { tenantId },
          status: { in: [...this.postPurchaseStatuses] },
          placedAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.DELIVERED,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.OPENED,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.CLICKED,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.BOUNCED,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.COMPLAINED,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
    ]);

    const revenue = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount ?? 0),
      0,
    );

    const payload = {
      tenantId,
      revenue,
      orders: orders.length,
      topInsight: insights[0]?.title ?? null,
      emailStats: { delivered, opened, clicked, bounced, complained },
      campaigns: campaigns.map((campaign) => ({
        name: campaign.name,
        spend: Number(campaign.spend ?? 0),
        roas: Number(campaign.roas ?? 0),
      })),
    };

    const key = this.getTodayKey(tenantId);
    const agentUrl = this.getAgentUrl();

    try {
      const response = await fetch(`${agentUrl}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Narrative agent returned ${response.status}`);
      }

      const data = (await response.json()) as NarrativeResponse;
      const narrative = data.narrative ?? 'Aucune narrative g�n�r�e.';
      await this.redisService.set(key, narrative, this.secondsUntilMidnight());
      return narrative;
    } catch {
      const fallback =
        `Hier : ${orders.length} commandes, ${revenue} de revenus. ` +
        `Point d'attention principal : ${insights[0]?.title ?? 'aucun insight critique'}. ` +
        `Action recommand�e : v�rifier les campagnes et la d�livrabilit� email.`;

      await this.redisService.set(key, fallback, this.secondsUntilMidnight());
      return fallback;
    }
  }

  async getRecommendations(tenantId: string) {
    const insights = await this.prisma.insight.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return insights.map((insight) => {
      let action = 'Analyser cet insight';

      if (insight.type === InsightType.AD_WASTE) {
        action = `Pauser ou revoir la campagne li�e � "${insight.title}"`;
      }
      if (insight.type === InsightType.EMAIL_PERFORMANCE) {
        action = 'Nettoyer la base email et v�rifier le contenu envoy�';
      }
      if (insight.type === InsightType.SEGMENT_OPPORTUNITY) {
        action = 'Augmenter le budget ou lancer une campagne cibl�e';
      }

      return {
        id: insight.id,
        type: insight.type,
        title: insight.title,
        action,
        impact: insight.impact === null ? null : Number(insight.impact),
        createdAt: insight.createdAt,
      };
    });
  }

  async ask(
    tenantId: string,
    question: string,
    context?: Record<string, unknown>,
  ) {
    const agentUrl = this.getAgentUrl();

    try {
      const response = await fetch(`${agentUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          question,
          context: context ?? {},
        }),
      });

      if (!response.ok) {
        throw new Error(`Copilot agent returned ${response.status}`);
      }

      const data = (await response.json()) as AskResponse;
      return {
        answer: data.answer ?? 'Aucune r�ponse.',
        reasoning: data.reasoning ?? null,
        actions: data.actions ?? [],
      };
    } catch {
      return {
        answer: `R�ponse mock : ${question}`,
        reasoning: 'Agent Python indisponible, fallback local activ�.',
        actions: [],
      };
    }
  }

  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(23, 59, 59, 999);
    return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  }
}
