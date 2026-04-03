import { Injectable } from '@nestjs/common';
import { InsightType, OrderStatus } from '@prisma/client';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AnalyticsService } from '../../modules/analytics/analytics.service';

@Injectable()
export class IntelligenceGrpcService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @GrpcMethod('IntelligenceService', 'GetAnalyticsSummary')
  async getAnalyticsSummary(data: { tenantId: string; days: number }) {
    const days = data.days && data.days > 0 ? data.days : 7;
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));

    const [summary, customers] = await Promise.all([
      this.analyticsService.getSummary(
        data.tenantId,
        this.toDateString(from),
        this.toDateString(to),
      ),
      this.prisma.contact.count({
        where: {
          tenantId: data.tenantId,
        },
      }),
    ]);

    const revenue = Number(summary.totalRevenue ?? 0);
    const orders = Number(summary.totalOrders ?? 0);
    const averageOrderValue = orders > 0 ? revenue / orders : 0;
    const anomalyNote =
      summary.anomalies.length > 0 ? ` ${summary.anomalies[0].message}` : '';

    return {
      revenue,
      orders,
      customers,
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      summary:
        `Last ${days} days: ${revenue.toFixed(2)} revenue from ${orders} orders across ${customers} customers.${anomalyNote}`.trim(),
    };
  }

  @GrpcMethod('IntelligenceService', 'PushInsight')
  async pushInsight(data: {
    tenantId: string;
    type: string;
    title: string;
    description: string;
    severity: string;
  }) {
    const insight = await this.prisma.insight.create({
      data: {
        tenantId: data.tenantId,
        type: this.mapInsightType(data.type, data.title),
        title: data.title,
        description: data.description || null,
        data: {
          sourceType: data.type || 'custom',
          severity: data.severity || 'info',
        },
      },
    });

    return {
      id: insight.id,
      status: 'created',
    };
  }

  @GrpcMethod('IntelligenceService', 'GetRevenueForecast')
  async getRevenueForecast(data: { tenantId: string; days: number }) {
    const days = data.days && data.days > 0 ? data.days : 7;
    const historyWindow = Math.max(days * 4, 14);
    const since = new Date();
    since.setDate(since.getDate() - historyWindow);

    const orders = await this.prisma.order.findMany({
      where: {
        contact: {
          tenantId: data.tenantId,
        },
        status: {
          in: [OrderStatus.PAID, OrderStatus.FULFILLED],
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

    const historicalSeries: number[] = [];
    for (let offset = historyWindow - 1; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      historicalSeries.push(revenueByDay.get(this.toDateString(date)) ?? 0);
    }

    const averageDailyRevenue =
      historicalSeries.length > 0
        ? historicalSeries.reduce((sum, value) => sum + value, 0) /
          historicalSeries.length
        : 0;

    return {
      predictedRevenue: Number((averageDailyRevenue * days).toFixed(2)),
      dailyForecast: Array.from({ length: days }, () =>
        Number(averageDailyRevenue.toFixed(2)),
      ),
      model: 'rolling_daily_average',
    };
  }

  @GrpcMethod('IntelligenceService', 'AskCopilot')
  async askCopilot(data: {
    tenantId: string;
    question: string;
    context?: string;
  }) {
    const days = 7;
    const [analytics, forecast, lastInsights] = await Promise.all([
      this.getAnalyticsSummary({
        tenantId: data.tenantId,
        days,
      }),
      this.getRevenueForecast({
        tenantId: data.tenantId,
        days,
      }),
      this.prisma.insight.findMany({
        where: {
          tenantId: data.tenantId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      }),
    ]);

    const actions: string[] = [];

    if (analytics.orders === 0) {
      actions.push(
        'Audit traffic, checkout, and event tracking for the last 7 days.',
      );
    }

    if (analytics.averageOrderValue > 0 && analytics.averageOrderValue < 50) {
      actions.push('Test bundles or upsells to increase average order value.');
    }

    if (forecast.predictedRevenue < analytics.revenue) {
      actions.push(
        'Launch a retention or win-back campaign to offset the softer forecast.',
      );
    }

    if (lastInsights.length === 0) {
      actions.push(
        'Generate fresh insights so future copilot answers have more context.',
      );
    }

    const recentInsights =
      lastInsights.map((insight) => insight.title).join(', ') || 'none';

    const reasoning = [
      `Question: ${data.question}`,
      `Context: ${data.context || 'none'}`,
      `Revenue (last ${days} days): ${analytics.revenue.toFixed(2)}`,
      `Orders (last ${days} days): ${analytics.orders}`,
      `Customers: ${analytics.customers}`,
      `Average order value: ${analytics.averageOrderValue.toFixed(2)}`,
      `Forecast (${days} days): ${forecast.predictedRevenue.toFixed(2)} via ${forecast.model}`,
      `Recent insights: ${recentInsights}`,
    ].join('\n');

    const answer = [
      `For tenant ${data.tenantId}, the last ${days} days produced ${analytics.revenue.toFixed(2)} in revenue from ${analytics.orders} orders.`,
      `The current forecast for the next ${days} days is ${forecast.predictedRevenue.toFixed(2)} using a ${forecast.model} baseline.`,
      actions.length > 0
        ? `Top priority: ${actions[0]}`
        : 'No urgent action stands out from the available data.',
    ].join(' ');

    return {
      answer,
      reasoning,
      actions,
    };
  }

  private mapInsightType(type: string, title: string): InsightType {
    const normalized = `${type} ${title}`.trim().toLowerCase();

    if (normalized.includes('anomaly') || normalized.includes('drop')) {
      return InsightType.ANOMALY;
    }

    if (normalized.includes('forecast') || normalized.includes('revenue')) {
      return InsightType.REVENUE_FORECAST;
    }

    if (normalized.includes('email')) {
      return InsightType.EMAIL_PERFORMANCE;
    }

    if (normalized.includes('product')) {
      return InsightType.PRODUCT_INTELLIGENCE;
    }

    if (normalized.includes('ad') || normalized.includes('waste')) {
      return InsightType.AD_WASTE;
    }

    return InsightType.SEGMENT_OPPORTUNITY;
  }

  private toDateString(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
