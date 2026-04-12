import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import {
  AnalyticsAnomaly,
  AnalyticsSummary,
  BlendedRoasTimeSeriesItem,
  RevenueTimeSeriesItem,
} from './types/analytics.types';

type Granularity = 'day' | 'week' | 'month';

type DailyMetricsSnapshot = {
  sessions: string | number | null;
  newContacts: string | number | null;
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickhouseService,
  ) {}

  async getSummary(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<AnalyticsSummary> {
    const summaryQuery = `
      SELECT
        sum(revenue) AS totalRevenue,
        sum(orders) AS totalOrders,
        sum(sessions) AS totalSessions,
        sum(new_contacts) AS newContacts
      FROM metrics_daily
      WHERE tenant_id = {tenantId:String}
        AND date >= toDate({from:String})
        AND date <= toDate({to:String})
    `;

    const adSpendQuery = `
      SELECT
        sum(spend) AS adsSpend
      FROM ad_metrics_daily
      WHERE tenant_id = {tenantId:String}
        AND date >= toDate({from:String})
        AND date <= toDate({to:String})
    `;

    const [summaryRows, adSpendRows] = await Promise.all([
      this.clickhouse.query<{
        totalRevenue: string | number | null;
        totalOrders: string | number | null;
        totalSessions: string | number | null;
        newContacts: string | number | null;
      }>(summaryQuery, { tenantId, from, to }),
      this.clickhouse.query<{ adsSpend: string | number | null }>(
        adSpendQuery,
        { tenantId, from, to },
      ),
    ]);

    const totalRevenue = Number(summaryRows?.[0]?.totalRevenue ?? 0);
    const totalOrders = Number(summaryRows?.[0]?.totalOrders ?? 0);
    const totalSessions = Number(summaryRows?.[0]?.totalSessions ?? 0);
    const newContacts = Number(summaryRows?.[0]?.newContacts ?? 0);
    const adsSpend = Number(adSpendRows?.[0]?.adsSpend ?? 0);

    const blendedRoas = adsSpend > 0 ? totalRevenue / adsSpend : 0;
    const mer = adsSpend > 0 ? totalRevenue / adsSpend : 0;
    const anomalies = await this.detectAnomalies(tenantId, to);

    return {
      totalRevenue,
      totalOrders,
      totalSessions,
      newContacts,
      adsSpend,
      blendedRoas: Number(blendedRoas.toFixed(2)),
      mer: Number(mer.toFixed(2)),
      anomalies,
    };
  }

  async getRevenueTimeSeries(
    tenantId: string,
    from: string,
    to: string,
    granularity: Granularity = 'day',
  ): Promise<RevenueTimeSeriesItem[]> {
    const bucketExpr =
      granularity === 'month'
        ? `toStartOfMonth(date)`
        : granularity === 'week'
          ? `toStartOfWeek(date)`
          : `date`;

    const query = `
      SELECT
        toString(${bucketExpr}) AS period,
        sum(revenue) AS revenue,
        sum(orders) AS orders,
        sum(sessions) AS sessions
      FROM metrics_daily
      WHERE tenant_id = {tenantId:String}
        AND date >= toDate({from:String})
        AND date <= toDate({to:String})
      GROUP BY period
      ORDER BY period ASC
    `;

    const rows = await this.clickhouse.query<{
      period: string;
      revenue: string | number;
      orders: string | number;
      sessions: string | number;
    }>(query, { tenantId, from, to });

    return rows.map((row) => ({
      period: row.period,
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
      sessions: Number(row.sessions ?? 0),
    }));
  }

  async getBlendedRoasTimeSeries(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<BlendedRoasTimeSeriesItem[]> {
    const query = `
      SELECT
        toString(m.date) AS date,
        sum(m.revenue) AS revenue,
        sum(ifNull(a.spend, 0)) AS spend
      FROM metrics_daily m
      LEFT JOIN (
        SELECT
          tenant_id,
          date,
          sum(spend) AS spend
        FROM ad_metrics_daily
        WHERE tenant_id = {tenantId:String}
          AND date >= toDate({from:String})
          AND date <= toDate({to:String})
        GROUP BY tenant_id, date
      ) a
        ON m.tenant_id = a.tenant_id
       AND m.date = a.date
      WHERE m.tenant_id = {tenantId:String}
        AND m.date >= toDate({from:String})
        AND m.date <= toDate({to:String})
      GROUP BY date
      ORDER BY date ASC
    `;

    const rows = await this.clickhouse.query<{
      date: string;
      revenue: string | number | null;
      spend: string | number | null;
    }>(query, { tenantId, from, to });

    return rows.map((row) => {
      const revenue = Number(row.revenue ?? 0);
      const spend = Number(row.spend ?? 0);
      const roas = spend > 0 ? revenue / spend : 0;
      const mer = spend > 0 ? revenue / spend : 0;

      return {
        date: row.date,
        roas: Number(roas.toFixed(2)),
        mer: Number(mer.toFixed(2)),
      };
    });
  }

  async detectAnomalies(
    tenantId: string,
    targetDate: string,
  ): Promise<AnalyticsAnomaly[]> {
    const currentDayQuery = `
      SELECT
        sum(revenue) AS currentRevenue
      FROM metrics_daily
      WHERE tenant_id = {tenantId:String}
        AND date = toDate({targetDate:String})
    `;

    const average7dQuery = `
      SELECT
        avg(revenue) AS avgRevenue7d
      FROM metrics_daily
      WHERE tenant_id = {tenantId:String}
        AND date >= subtractDays(toDate({targetDate:String}), 7)
        AND date < toDate({targetDate:String})
    `;

    const [currentRows, avgRows] = await Promise.all([
      this.clickhouse.query<{ currentRevenue: string | number | null }>(
        currentDayQuery,
        { tenantId, targetDate },
      ),
      this.clickhouse.query<{ avgRevenue7d: string | number | null }>(
        average7dQuery,
        { tenantId, targetDate },
      ),
    ]);

    const currentRevenue = Number(currentRows?.[0]?.currentRevenue ?? 0);
    const averageRevenue7d = Number(avgRows?.[0]?.avgRevenue7d ?? 0);

    if (averageRevenue7d <= 0) {
      return [];
    }

    const ratio = currentRevenue / averageRevenue7d;
    const anomalies: AnalyticsAnomaly[] = [];

    if (ratio < 0.5) {
      anomalies.push({
        severity: 'HIGH',
        message: 'Revenue dropped below 50% of the 7-day average.',
        currentRevenue,
        averageRevenue7d,
        ratio: Number(ratio.toFixed(2)),
      });
    } else if (ratio < 0.75) {
      anomalies.push({
        severity: 'MEDIUM',
        message: 'Revenue dropped below 75% of the 7-day average.',
        currentRevenue,
        averageRevenue7d,
        ratio: Number(ratio.toFixed(2)),
      });
    }

    return anomalies;
  }

  async ingestDailyMetrics(tenantId: string, date: string): Promise<void> {
    const startDate = new Date(`${date}T00:00:00.000Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);

    const [paidOrders, existingRows] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          contact: { tenantId },
          status: {
            in: ['PAID', 'FULFILLED'],
          },
          placedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          totalAmount: true,
        },
      }),
      this.clickhouse.query<DailyMetricsSnapshot>(
        `
          SELECT
            sum(sessions) AS sessions,
            sum(new_contacts) AS newContacts
          FROM metrics_daily
          WHERE tenant_id = {tenantId:String}
            AND date = toDate({date:String})
        `,
        { tenantId, date },
      ),
    ]);

    const revenue = paidOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount ?? 0),
      0,
    );
    const orders = paidOrders.length;
    const sessions = Number(existingRows?.[0]?.sessions ?? 0);
    const newContacts = Number(existingRows?.[0]?.newContacts ?? 0);

    await this.clickhouse.command(
      `
      ALTER TABLE metrics_daily
      DELETE WHERE tenant_id = {tenantId:String}
        AND date = toDate({date:String})
      `,
      { tenantId, date },
    );

    await this.clickhouse.insert('metrics_daily', [
      {
        tenant_id: tenantId,
        date,
        revenue,
        orders,
        ads_spend: 0,
        sessions,
        new_contacts: newContacts,
      },
    ]);

    this.logger.log(
      `Ingested daily metrics for tenant=${tenantId}, date=${date}, revenue=${revenue}, orders=${orders}, sessions=${sessions}`,
    );
  }

  async ingestAdMetrics(params: {
    tenantId: string;
    campaignId: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }): Promise<void> {
    await this.clickhouse.insert('ad_metrics_daily', [
      {
        tenant_id: params.tenantId,
        campaign_id: params.campaignId,
        date: params.date,
        spend: params.spend,
        impressions: params.impressions,
        clicks: params.clicks,
        conversions: params.conversions,
      },
    ]);
  }
}
