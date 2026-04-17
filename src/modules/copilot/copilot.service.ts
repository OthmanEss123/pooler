import { Injectable, Logger } from '@nestjs/common';
import { InsightType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type AskResponse = {
  answer?: string;
  reasoning?: string | null;
  actions?: string[];
};

type GroqMessageContentPart = {
  type?: string;
  text?: string;
};

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string | GroqMessageContentPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  private readonly groqApiKey = process.env.GROQ_API_KEY ?? '';
  private readonly groqModel = process.env.GROQ_MODEL ?? 'llama3-70b-8192';
  private readonly groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

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

    if (!this.groqApiKey) {
      this.logger.error('GROQ_API_KEY is missing for Copilot requests.');
      return this.buildFallbackAnswer(question);
    }

    try {
      const response = await fetch(this.groqUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.groqModel,
          temperature: 0.3,
          max_tokens: 700,
          messages: [
            {
              role: 'system',
              content:
                'Tu es le copilot commerce de Pilot. Reponds uniquement en JSON valide avec les cles answer, reasoning et actions. answer doit etre une chaine courte et utile en francais. reasoning doit etre une courte explication. actions doit etre un tableau de 0 a 3 actions concretes.',
            },
            {
              role: 'user',
              content: this.buildPrompt(tenantId, question, context),
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      });

      const rawBody = (await response.text()).trim();
      const data = this.parseGroqResponse(rawBody);

      if (!response.ok) {
        this.logger.error(
          `Groq request failed with status ${response.status}: ${rawBody || 'empty body'}`,
        );
        throw new Error(
          data?.error?.message ?? `Groq request failed with status ${response.status}`,
        );
      }

      const content = this.extractGroqContent(data);
      const parsed = this.parseAskResponse(content);

      return {
        answer:
          parsed.answer ??
          this.fallbackAnswerText(question),
        reasoning: parsed.reasoning ?? '',
        actions: parsed.actions ?? [],
      };
    } catch (error) {
      this.logger.error(
        `Copilot Groq request failed for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.buildFallbackAnswer(question);
    }
  }

  private buildPrompt(
    tenantId: string,
    question: string,
    context?: Record<string, unknown>,
  ) {
    return [
      `Tenant: ${tenantId}`,
      `Question: ${question}`,
      `Context: ${this.stringifyContext(context)}`,
      'Contraintes: reste centre sur WooCommerce, Google Ads et GA4. Donne une reponse operationnelle et actionnable.',
    ].join('\n');
  }

  private stringifyContext(context?: Record<string, unknown>) {
    if (!context || Object.keys(context).length === 0) {
      return 'No extra context provided.';
    }

    try {
      return JSON.stringify(context, null, 2);
    } catch {
      return '[unserializable context]';
    }
  }

  private parseGroqResponse(rawBody: string) {
    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody) as GroqResponse;
    } catch {
      this.logger.warn('Groq returned a non-JSON response body.');
      return null;
    }
  }

  private extractGroqContent(data: GroqResponse | null) {
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => part.text ?? '')
        .join('')
        .trim();
    }

    return '';
  }

  private parseAskResponse(rawContent: string): AskResponse {
    if (!rawContent) {
      return {};
    }

    const jsonCandidate = this.extractJsonObject(rawContent);
    if (!jsonCandidate) {
      return {
        answer: rawContent,
        reasoning: '',
        actions: [],
      };
    }

    try {
      const parsed = JSON.parse(jsonCandidate) as AskResponse;
      return {
        answer: typeof parsed.answer === 'string' ? parsed.answer.trim() : undefined,
        reasoning:
          typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '',
        actions: Array.isArray(parsed.actions)
          ? parsed.actions.filter(
              (action): action is string =>
                typeof action === 'string' && action.trim().length > 0,
            )
          : [],
      };
    } catch {
      return {
        answer: rawContent,
        reasoning: '',
        actions: [],
      };
    }
  }

  private extractJsonObject(rawContent: string) {
    const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? rawContent.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');

    if (start === -1 || end === -1 || end < start) {
      return null;
    }

    return candidate.slice(start, end + 1);
  }

  private buildFallbackAnswer(question: string) {
    return {
      answer: this.fallbackAnswerText(question),
      reasoning: '',
      actions: [],
    };
  }

  private fallbackAnswerText(question: string) {
    return `Service temporairement indisponible. Question recue: ${question}`;
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
