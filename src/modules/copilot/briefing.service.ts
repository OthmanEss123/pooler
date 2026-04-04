import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { HealthScoreService } from '../insights/health-score.service';
import {
  BriefingCampaignDto,
  BriefingForecastDto,
  BriefingResponseDto,
} from './dto/briefing-response.dto';

type SummarySnapshot = {
  totalRevenue: number;
  totalOrders: number;
  emailRevenue: number;
  adsSpend: number;
};

type ProductRecord = {
  id: string;
  externalId: string;
  sku: string | null;
  name: string;
};

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);
  private readonly paidStatuses = [OrderStatus.PAID, OrderStatus.FULFILLED];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsService,
    private readonly healthScoreService: HealthScoreService,
  ) {}

  async getBriefing(tenantId: string): Promise<BriefingResponseDto> {
    const cacheKey = this.getBriefingCacheKey(tenantId);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as BriefingResponseDto;
    }

    return this.generateBriefing(tenantId);
  }

  async refreshBriefing(tenantId: string): Promise<BriefingResponseDto> {
    await this.invalidateBriefingCache(tenantId);
    return this.generateBriefing(tenantId);
  }

  async invalidateBriefingCache(tenantId: string) {
    return this.redisService.del(this.getBriefingCacheKey(tenantId));
  }

  async generateBriefing(tenantId: string): Promise<BriefingResponseDto> {
    const now = new Date();
    const startOfToday = this.startOfDay(now);
    const endOfToday = now;
    const startOfYesterday = this.startOfDay(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );
    const endOfYesterday = new Date(startOfToday.getTime() - 1);
    const generatedAt = now.toISOString();

    const period = {
      date: generatedAt.slice(0, 10),
      yesterdayFrom: startOfYesterday.toISOString(),
      yesterdayTo: endOfYesterday.toISOString(),
      todayFrom: startOfToday.toISOString(),
      todayTo: endOfToday.toISOString(),
    };

    const [
      yesterdaySummary,
      todaySummary,
      insights,
      healthScores,
      topCampaigns,
      forecast,
      activeFlowProducts,
    ] = await Promise.all([
      this.getSummarySafe(tenantId, startOfYesterday, endOfYesterday),
      this.getSummarySafe(tenantId, startOfToday, endOfToday),
      this.prisma.insight.findMany({
        where: {
          tenantId,
          isRead: false,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
        select: {
          type: true,
          title: true,
          description: true,
        },
      }),
      this.healthScoreService.getDistribution(tenantId),
      this.getTopCampaigns(tenantId),
      this.getForecast(tenantId),
      this.getActiveFlowProducts(tenantId),
    ]);

    const briefing: BriefingResponseDto = {
      generatedAt,
      period,
      yesterday: {
        revenue: yesterdaySummary.totalRevenue,
        orders: yesterdaySummary.totalOrders,
        emailRevenue: yesterdaySummary.emailRevenue,
        adsSpend: yesterdaySummary.adsSpend,
      },
      today: {
        revenueToDate: todaySummary.totalRevenue,
        ordersToDate: todaySummary.totalOrders,
      },
      insights,
      healthScores,
      topCampaigns,
      forecast,
      narrative: '',
    };

    briefing.narrative = await this.generateNarrative(tenantId, {
      ...briefing,
      activeFlowProducts,
    });

    await this.redisService.set(
      this.getBriefingCacheKey(tenantId),
      JSON.stringify(briefing),
      this.secondsUntilMidnight(now),
    );

    return briefing;
  }

  private async getSummarySafe(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<SummarySnapshot> {
    try {
      const summary = await this.analyticsService.getSummary(
        tenantId,
        this.toDateString(from),
        this.toDateString(to),
      );

      return {
        totalRevenue: Number(summary.totalRevenue ?? 0),
        totalOrders: Number(summary.totalOrders ?? 0),
        emailRevenue: Number(summary.emailRevenue ?? 0),
        adsSpend: Number(summary.adsSpend ?? 0),
      };
    } catch (error) {
      this.logger.warn(
        `Analytics summary fallback for tenant=${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return this.buildLocalSummary(tenantId, from, to);
    }
  }

  private async buildLocalSummary(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<SummarySnapshot> {
    const [orders, campaigns, adCampaigns] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          status: {
            in: this.paidStatuses,
          },
          placedAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          totalAmount: true,
        },
      }),
      this.prisma.campaign.findMany({
        where: {
          tenantId,
          OR: [
            {
              sentAt: {
                gte: from,
                lte: to,
              },
            },
            {
              createdAt: {
                gte: from,
                lte: to,
              },
            },
          ],
        },
        select: {
          revenue: true,
        },
      }),
      this.prisma.adCampaign.findMany({
        where: {
          tenantId,
          updatedAt: {
            gte: from,
            lte: to,
          },
        },
        select: {
          spend: true,
        },
      }),
    ]);

    return {
      totalRevenue: orders.reduce(
        (sum, order) => sum + Number(order.totalAmount ?? 0),
        0,
      ),
      totalOrders: orders.length,
      emailRevenue: campaigns.reduce(
        (sum, campaign) => sum + Number(campaign.revenue ?? 0),
        0,
      ),
      adsSpend: adCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.spend ?? 0),
        0,
      ),
    };
  }

  private async getTopCampaigns(
    tenantId: string,
  ): Promise<BriefingCampaignDto[]> {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        tenantId,
        OR: [
          {
            sentAt: {
              gte: since,
            },
          },
          {
            createdAt: {
              gte: since,
            },
          },
        ],
      },
      orderBy: {
        revenue: 'desc',
      },
      take: 3,
      select: {
        name: true,
        totalSent: true,
        totalDelivered: true,
        totalOpened: true,
        revenue: true,
      },
    });

    return campaigns.map((campaign) => ({
      name: campaign.name,
      openRate:
        campaign.totalDelivered > 0
          ? Number(
              ((campaign.totalOpened / campaign.totalDelivered) * 100).toFixed(
                2,
              ),
            )
          : campaign.totalSent > 0
            ? Number(
                ((campaign.totalOpened / campaign.totalSent) * 100).toFixed(2),
              )
            : 0,
      revenue: Number(campaign.revenue ?? 0),
    }));
  }

  private async getForecast(tenantId: string): Promise<BriefingForecastDto> {
    const cacheKey = this.getForecastCacheKey(tenantId);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as BriefingForecastDto;
    }

    const historyWindow = 120;
    const since = new Date();
    since.setDate(since.getDate() - historyWindow);

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: {
          in: this.paidStatuses,
        },
        placedAt: {
          gte: since,
        },
      },
      select: {
        totalAmount: true,
        placedAt: true,
      },
      orderBy: {
        placedAt: 'asc',
      },
    });

    const revenueByDay = new Map<string, number>();
    for (const order of orders) {
      const key = this.toDateString(order.placedAt);
      revenueByDay.set(
        key,
        (revenueByDay.get(key) ?? 0) + Number(order.totalAmount ?? 0),
      );
    }

    const dailySeries: number[] = [];
    for (let offset = historyWindow - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      dailySeries.push(revenueByDay.get(this.toDateString(date)) ?? 0);
    }

    const recent30 = dailySeries.slice(-30);
    const previous30 = dailySeries.slice(-60, -30);
    const averageDailyRevenue =
      dailySeries.length === 0
        ? 0
        : dailySeries.reduce((sum, value) => sum + value, 0) /
          dailySeries.length;
    const recentAverage =
      recent30.length === 0
        ? 0
        : recent30.reduce((sum, value) => sum + value, 0) / recent30.length;
    const previousAverage =
      previous30.length === 0
        ? 0
        : previous30.reduce((sum, value) => sum + value, 0) / previous30.length;

    const trend =
      recentAverage > previousAverage * 1.05
        ? 'up'
        : recentAverage < previousAverage * 0.95
          ? 'down'
          : 'flat';
    const nonZeroDays = dailySeries.filter((value) => value > 0).length;
    const confidence = Number(
      Math.min(
        0.95,
        Math.max(0.2, nonZeroDays / Math.max(dailySeries.length, 1)),
      ).toFixed(2),
    );

    const forecast = {
      total30d: Number((averageDailyRevenue * 30).toFixed(2)),
      trend,
      confidence,
    };

    await this.redisService.set(
      cacheKey,
      JSON.stringify(forecast),
      this.secondsUntilMidnight(),
    );

    return forecast;
  }

  private async getActiveFlowProducts(tenantId: string) {
    const [products, flows] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        select: {
          id: true,
          externalId: true,
          sku: true,
          name: true,
        },
      }),
      this.prisma.flow.findMany({
        where: {
          tenantId,
          status: FlowStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          nodes: true,
        },
      }),
    ]);

    if (products.length === 0 || flows.length === 0) {
      return [];
    }

    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const productByExternalId = new Map(
      products.map((product) => [product.externalId, product]),
    );
    const productBySku = new Map(
      products
        .filter((product) => product.sku)
        .map((product) => [product.sku!.toLowerCase(), product]),
    );

    const counts = new Map<string, number>();

    for (const flow of flows) {
      const matchedProductIds = new Set<string>();
      this.collectProductReferences(flow.nodes, matchedProductIds, {
        productById,
        productByExternalId,
        productBySku,
      });

      for (const productId of matchedProductIds) {
        counts.set(productId, (counts.get(productId) ?? 0) + 1);
      }
    }

    return [...counts.entries()].map(([productId, activeFlows]) => ({
      productId,
      name: productById.get(productId)?.name ?? 'Unknown product',
      activeFlows,
    }));
  }

  private collectProductReferences(
    value: unknown,
    productIds: Set<string>,
    indexes: {
      productById: Map<string, ProductRecord>;
      productByExternalId: Map<string, ProductRecord>;
      productBySku: Map<string, ProductRecord>;
    },
  ) {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectProductReferences(item, productIds, indexes);
      }
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (
        key === 'productId' ||
        key === 'productIds' ||
        key === 'productExternalId' ||
        key === 'productExternalIds' ||
        key === 'sku' ||
        key === 'skus'
      ) {
        this.registerReference(child, productIds, indexes);
      }

      this.collectProductReferences(child, productIds, indexes);
    }
  }

  private registerReference(
    value: unknown,
    productIds: Set<string>,
    indexes: {
      productById: Map<string, ProductRecord>;
      productByExternalId: Map<string, ProductRecord>;
      productBySku: Map<string, ProductRecord>;
    },
  ) {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.registerReference(item, productIds, indexes);
      }
      return;
    }

    if (typeof value !== 'string' || value.length === 0) {
      return;
    }

    const product =
      indexes.productById.get(value) ??
      indexes.productByExternalId.get(value) ??
      indexes.productBySku.get(value.toLowerCase()) ??
      null;

    if (product) {
      productIds.add(product.id);
    }
  }

  private async generateNarrative(
    tenantId: string,
    data: BriefingResponseDto & {
      activeFlowProducts: Array<{
        productId: string;
        name: string;
        activeFlows: number;
      }>;
    },
  ) {
    const explicitAgentUrl = process.env.NARRATIVE_AGENT_URL;
    const baseUrl =
      explicitAgentUrl ?? this.configService.get<string>('NARRATIVE_AGENT_URL');
    if (
      (process.env.NODE_ENV === 'test' && !explicitAgentUrl?.trim()) ||
      !baseUrl
    ) {
      return this.buildFallbackNarrative(data);
    }

    try {
      const response = await fetch(`${baseUrl}/narrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          briefing: data,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Narrative agent returned ${response.status}`);
      }

      const payload = (await response.json()) as { narrative?: string };
      if (payload.narrative && payload.narrative.trim().length > 0) {
        return payload.narrative;
      }
    } catch (error) {
      this.logger.warn(
        `Narrative fallback for tenant=${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.buildFallbackNarrative(data);
  }

  private buildFallbackNarrative(data: BriefingResponseDto) {
    return (
      `Briefing du ${data.period.date} - ` +
      `Revenue hier : ${data.yesterday.revenue} EUR (${data.yesterday.orders} cmds). ` +
      `Attention : ${data.insights[0]?.title ?? 'aucun insight critique'}. ` +
      `Tendance 30j : ${data.forecast.trend}.`
    );
  }

  private getBriefingCacheKey(tenantId: string) {
    return `briefing:${tenantId}:${this.toDateString(new Date())}`;
  }

  private getForecastCacheKey(tenantId: string) {
    return `briefing:${tenantId}:${this.toDateString(new Date())}:forecast30d`;
  }

  private secondsUntilMidnight(reference = new Date()) {
    const midnight = new Date(reference);
    midnight.setHours(23, 59, 59, 999);
    return Math.max(
      1,
      Math.floor((midnight.getTime() - reference.getTime()) / 1000),
    );
  }

  private startOfDay(date: Date) {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private toDateString(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
