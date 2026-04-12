import { Injectable } from '@nestjs/common';
import { InsightType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type AskResponse = {
  answer?: string;
  reasoning?: string | null;
  actions?: string[];
};

@Injectable()
export class CopilotService {
  private readonly agentUrl = 'http://localhost:8003';

  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(tenantId: string) {
    const insights = await this.prisma.insight.findMany({
      where: {
        tenantId,
        isRead: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        impact: true,
        createdAt: true,
      },
    });

    return insights
      .map((insight) => {
        const impact = insight.impact === null ? 0 : Number(insight.impact);
        return {
          id: insight.id,
          type: insight.type,
          title: insight.title,
          action: this.mapAction(insight.type),
          priority: this.mapPriority(insight.type, impact),
          impact,
          createdAt: insight.createdAt,
        };
      })
      .sort((left, right) => right.impact - left.impact)
      .slice(0, 10);
  }

  async ask(
    tenantId: string,
    question: string,
    context?: Record<string, unknown>,
  ) {
    if (process.env.NODE_ENV === 'test') {
      return this.buildFallbackAnswer(question);
    }

    try {
      const response = await fetch(`${this.agentUrl}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          question,
          context: JSON.stringify(context ?? {}),
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Copilot agent returned ${response.status}`);
      }

      const data = (await response.json()) as AskResponse;
      return {
        answer: data.answer ?? 'Service temporairement indisponible',
        reasoning: data.reasoning ?? '',
        actions: data.actions ?? [],
      };
    } catch {
      return this.buildFallbackAnswer(question);
    }
  }

  private buildFallbackAnswer(question: string) {
    return {
      answer: `Service temporairement indisponible. Question recue: ${question}`,
      reasoning: '',
      actions: [],
    };
  }

  private mapAction(type: InsightType) {
    switch (type) {
      case InsightType.AD_WASTE:
        return 'Pauser ou optimiser la campagne ads';
      case InsightType.ANOMALY:
        return 'Analyser la cause';
      case InsightType.SEGMENT_OPPORTUNITY:
        return 'Ajuster le ciblage ou le budget';
      case InsightType.PRODUCT_INTELLIGENCE:
        return 'Renforcer la mise en avant produit';
      case InsightType.REVENUE_FORECAST:
        return 'Preparer un plan de soutien';
      default:
        return 'Analyser cet insight';
    }
  }

  private mapPriority(type: InsightType, impact: number) {
    if (type === InsightType.ANOMALY || type === InsightType.AD_WASTE) {
      return 'HIGH';
    }

    if (impact >= 100) {
      return 'HIGH';
    }

    if (impact > 0) {
      return 'MEDIUM';
    }

    return 'LOW';
  }
}
