import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, RfmSegment } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AnalyticsService } from '../analytics/analytics.service';
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

@Injectable()
export class BriefingService {
  private readonly logger = new Logger(BriefingService.name);
  private readonly paidStatuses = [OrderStatus.PAID, OrderStatus.FULFILLED];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly analyticsService: AnalyticsService,
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

    const [yesterdaySummary, todaySummary, insights, healthScores, forecast] =
      await Promise.all([
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
        this.getHealthScoreDistribution(tenantId),
        this.getForecast(tenantId),
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
      topCampaigns: this.getTopCampaignsPlaceholder(),
      forecast,
    };

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
        emailRevenue: 0,
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
    const [orders, adCampaigns] = await Promise.all([
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
      emailRevenue: 0,
      adsSpend: adCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.spend ?? 0),
        0,
      ),
    };
  }

  private async getHealthScoreDistribution(tenantId: string) {
    const scores = await this.prisma.customerHealthScore.findMany({
      where: { tenantId },
      select: { segment: true },
    });

    const distribution: Record<RfmSegment, number> = {
      [RfmSegment.CHAMPION]: 0,
      [RfmSegment.LOYAL]: 0,
      [RfmSegment.POTENTIAL]: 0,
      [RfmSegment.NEW]: 0,
      [RfmSegment.AT_RISK]: 0,
      [RfmSegment.CANT_LOSE]: 0,
      [RfmSegment.LOST]: 0,
    };

    for (const score of scores) {
      distribution[score.segment] += 1;
    }

    return distribution;
  }

  private getTopCampaignsPlaceholder(): BriefingCampaignDto[] {
    return [];
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
