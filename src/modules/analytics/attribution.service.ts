import {
  AttributionSummaryItem,
  AttributionCampaignItem,
} from './types/analytics.types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EmailEventType, OrderStatus } from '@prisma/client';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  AttributionModel,
  QueryAttributionDto,
} from './dto/query-attribution.dto';

type CanonicalAttributionModel =
  | 'last_touch'
  | 'first_touch'
  | 'linear'
  | 'time_decay'
  | 'position_based';

type Touchpoint = {
  campaignId: string;
  contactId: string;
  channel: string;
  type: EmailEventType | 'SOURCE';
  createdAt: Date;
};

type RevenueOrder = {
  contactId: string;
  totalAmount: number;
  placedAt: Date;
  sourceChannel: string | null;
  contactCreatedAt: Date | null;
};

type CampaignAggregate = {
  campaignId: string;
  name: string;
  attributedRevenue: number;
  attributedOrders: number;
  clicks: number;
  opens: number;
};

@Injectable()
export class AttributionService {
  private readonly paidStatuses = [OrderStatus.PAID, OrderStatus.FULFILLED];

  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickhouseService,
  ) {}

  async getAttributionSummary(
    tenantId: string,
    query: QueryAttributionDto,
  ): Promise<AttributionSummaryItem> {
    const model = this.normalizeModel(query.model);
    const limit = query.limit ?? 10;
    const fromDate = this.parseStartDate(query.from);
    const toDate = this.parseEndDate(query.to);
    const lookbackDays = this.resolveLookbackDays(query);
    const touchpointStart = new Date(fromDate);
    touchpointStart.setUTCDate(touchpointStart.getUTCDate() - lookbackDays);

    const [orders, touchpoints] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          tenantId,
          status: {
            in: this.paidStatuses,
          },
          placedAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
        select: {
          contactId: true,
          totalAmount: true,
          placedAt: true,
          contact: {
            select: {
              sourceChannel: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.emailEvent.findMany({
        where: {
          tenantId,
          type: {
            in: [EmailEventType.CLICKED, EmailEventType.OPENED],
          },
          createdAt: {
            gte: touchpointStart,
            lte: toDate,
          },
        },
        select: {
          campaignId: true,
          contactId: true,
          type: true,
          createdAt: true,
        },
      }),
    ]);

    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.totalAmount ?? 0),
      0,
    );

    const touchpointsByContact = new Map<string, Touchpoint[]>();

    for (const touchpoint of touchpoints) {
      const current = touchpointsByContact.get(touchpoint.contactId) ?? [];
      current.push({
        campaignId: touchpoint.campaignId,
        contactId: touchpoint.contactId,
        channel: 'email',
        type: touchpoint.type,
        createdAt: touchpoint.createdAt,
      });
      touchpointsByContact.set(touchpoint.contactId, current);
    }

    for (const events of touchpointsByContact.values()) {
      events.sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
    }

    const aggregates = new Map<string, CampaignAggregate>();
    let attributedRevenue = 0;
    let unattributedRevenue = 0;
    let unattributedOrders = 0;

    for (const touchpoint of touchpoints) {
      if (touchpoint.createdAt < fromDate) {
        continue;
      }

      const aggregate = this.getOrCreateAggregate(
        aggregates,
        touchpoint.campaignId,
      );
      if (touchpoint.type === EmailEventType.CLICKED) {
        aggregate.clicks += 1;
      }

      if (touchpoint.type === EmailEventType.OPENED) {
        aggregate.opens += 1;
      }
    }

    for (const order of orders.map<RevenueOrder>((item) => ({
      contactId: item.contactId,
      totalAmount: Number(item.totalAmount ?? 0),
      placedAt: item.placedAt,
      sourceChannel: item.contact?.sourceChannel ?? null,
      contactCreatedAt: item.contact?.createdAt ?? null,
    }))) {
      const eligible = this.getEligibleTouchpoints(
        order,
        touchpointsByContact.get(order.contactId) ?? [],
        query,
      );

      const resolvedTouchpoints =
        eligible.length > 0
          ? eligible
          : this.getFallbackTouchpoints(order, query);

      if (resolvedTouchpoints.length === 0) {
        unattributedRevenue += order.totalAmount;
        unattributedOrders += 1;
        continue;
      }

      const distributed = this.distributeRevenue(
        resolvedTouchpoints,
        order.totalAmount,
        order.placedAt,
        model,
      );

      for (const item of distributed) {
        const aggregate = this.getOrCreateAggregate(
          aggregates,
          item.campaignId,
        );
        aggregate.attributedRevenue += item.revenue;
        aggregate.attributedOrders += item.fraction;
      }

      attributedRevenue += order.totalAmount;
    }

    const campaignIds = [...aggregates.keys()].filter(
      (campaignId) => !campaignId.startsWith('channel:'),
    );
    const campaigns =
      campaignIds.length > 0
        ? await this.prisma.campaign.findMany({
            where: {
              tenantId,
              id: {
                in: campaignIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : [];

    const campaignNameById = new Map(
      campaigns.map((campaign) => [campaign.id, campaign.name]),
    );

    const items = [...aggregates.values()]
      .map<AttributionCampaignItem>((aggregate) => ({
        campaignId: aggregate.campaignId,
        name:
          campaignNameById.get(aggregate.campaignId) ??
          aggregate.name ??
          aggregate.campaignId,
        attributedRevenue: Number(aggregate.attributedRevenue.toFixed(2)),
        attributedOrders: aggregate.attributedOrders,
        clicks: aggregate.clicks,
        opens: aggregate.opens,
        revenueShare:
          attributedRevenue > 0
            ? Number(
                (aggregate.attributedRevenue / attributedRevenue).toFixed(4),
              )
            : 0,
      }))
      .sort((left, right) => {
        if (right.attributedRevenue !== left.attributedRevenue) {
          return right.attributedRevenue - left.attributedRevenue;
        }

        if (right.attributedOrders !== left.attributedOrders) {
          return right.attributedOrders - left.attributedOrders;
        }

        if (right.clicks !== left.clicks) {
          return right.clicks - left.clicks;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, limit);

    return {
      model,
      from: query.from,
      to: query.to,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      attributedRevenue: Number(attributedRevenue.toFixed(2)),
      unattributedRevenue: Number(unattributedRevenue.toFixed(2)),
      unattributedOrders,
      campaigns: items,
    };
  }

  async getCacSummary(tenantId: string, from: string, to: string) {
    const [rows, customersAcquired] = await Promise.all([
      this.clickhouse.query<{ adsSpend: string | number | null }>(
        `
          SELECT sum(spend) AS adsSpend
          FROM ad_metrics_daily
          WHERE tenant_id = {tenantId:String}
            AND date >= toDate({from:String})
            AND date <= toDate({to:String})
        `,
        { tenantId, from, to },
      ),
      this.prisma.contact.count({
        where: {
          tenantId,
          firstOrderAt: {
            gte: this.parseStartDate(from),
            lte: this.parseEndDate(to),
          },
        },
      }),
    ]);

    const adSpend = Number(rows?.[0]?.adsSpend ?? 0);
    const total = customersAcquired > 0 ? adSpend / customersAcquired : 0;

    return {
      from,
      to,
      adSpend: Number(adSpend.toFixed(2)),
      customersAcquired,
      total: Number(total.toFixed(2)),
    };
  }

  async getLtvBreakdown(tenantId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      select: {
        id: true,
        totalRevenue: true,
        totalOrders: true,
        healthScore: {
          select: {
            segment: true,
            predictedLtv: true,
          },
        },
      },
    });

    const groups = new Map<
      string,
      { contacts: number; totalRevenue: number; predictedLtvTotal: number }
    >();

    for (const contact of contacts) {
      const segment = contact.healthScore?.segment ?? 'UNSEGMENTED';
      const entry = groups.get(segment) ?? {
        contacts: 0,
        totalRevenue: 0,
        predictedLtvTotal: 0,
      };

      entry.contacts += 1;
      entry.totalRevenue += Number(contact.totalRevenue ?? 0);
      entry.predictedLtvTotal += Number(contact.healthScore?.predictedLtv ?? 0);
      groups.set(segment, entry);
    }

    return [...groups.entries()]
      .map(([segment, stats]) => ({
        segment,
        contacts: stats.contacts,
        averageLtv:
          stats.contacts > 0
            ? Number((stats.totalRevenue / stats.contacts).toFixed(2))
            : 0,
        predictedLtvAverage:
          stats.contacts > 0
            ? Number((stats.predictedLtvTotal / stats.contacts).toFixed(2))
            : 0,
        totalRevenue: Number(stats.totalRevenue.toFixed(2)),
      }))
      .sort((left, right) => right.averageLtv - left.averageLtv);
  }

  async getContactLtv(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        id: contactId,
      },
      select: {
        id: true,
        totalRevenue: true,
        totalOrders: true,
        healthScore: {
          select: {
            segment: true,
            predictedLtv: true,
          },
        },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact introuvable');
    }

    return {
      contactId: contact.id,
      ltv: Number(contact.totalRevenue ?? 0),
      totalOrders: contact.totalOrders,
      predictedLtv: Number(contact.healthScore?.predictedLtv ?? 0),
      segment: contact.healthScore?.segment ?? null,
    };
  }

  private getOrCreateAggregate(
    aggregates: Map<string, CampaignAggregate>,
    campaignId: string,
  ) {
    const existing = aggregates.get(campaignId);
    if (existing) {
      return existing;
    }

    const created: CampaignAggregate = {
      campaignId,
      name: campaignId.startsWith('channel:')
        ? campaignId.replace('channel:', '').toUpperCase()
        : campaignId,
      attributedRevenue: 0,
      attributedOrders: 0,
      clicks: 0,
      opens: 0,
    };
    aggregates.set(campaignId, created);
    return created;
  }

  private distributeRevenue(
    eligible: Touchpoint[],
    revenue: number,
    orderDate: Date,
    model: CanonicalAttributionModel,
  ): { campaignId: string; revenue: number; fraction: number }[] {
    if (eligible.length === 0) return [];

    switch (model) {
      case 'first_touch':
        return [
          {
            campaignId: eligible[0].campaignId,
            revenue,
            fraction: 1,
          },
        ];

      case 'last_touch':
        return [
          {
            campaignId: eligible[eligible.length - 1].campaignId,
            revenue,
            fraction: 1,
          },
        ];

      case 'linear': {
        const share = revenue / eligible.length;
        const frac = 1 / eligible.length;
        return eligible.map((tp) => ({
          campaignId: tp.campaignId,
          revenue: share,
          fraction: frac,
        }));
      }

      case 'time_decay':
        return this.distributeTimeDecay(eligible, revenue, orderDate);

      case 'position_based':
        return this.distributePositionBased(eligible, revenue);
    }
  }

  private distributeTimeDecay(
    touchpoints: Touchpoint[],
    revenue: number,
    orderDate: Date,
  ): { campaignId: string; revenue: number; fraction: number }[] {
    const weights = touchpoints.map((tp) => {
      const hoursAgo =
        (orderDate.getTime() - tp.createdAt.getTime()) / 3_600_000;
      return Math.pow(0.5, hoursAgo / 24);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);

    return touchpoints.map((tp, i) => ({
      campaignId: tp.campaignId,
      revenue: (weights[i] / totalWeight) * revenue,
      fraction: weights[i] / totalWeight,
    }));
  }

  private distributePositionBased(
    touchpoints: Touchpoint[],
    revenue: number,
  ): { campaignId: string; revenue: number; fraction: number }[] {
    if (touchpoints.length === 1) {
      return [{ campaignId: touchpoints[0].campaignId, revenue, fraction: 1 }];
    }

    return touchpoints.map((tp, i) => {
      let weight: number;
      if (i === 0) {
        weight = 0.4;
      } else if (i === touchpoints.length - 1) {
        weight = 0.4;
      } else {
        weight = 0.2 / (touchpoints.length - 2);
      }

      return {
        campaignId: tp.campaignId,
        revenue: weight * revenue,
        fraction: weight,
      };
    });
  }

  private getEligibleTouchpoints(
    order: RevenueOrder,
    touchpoints: Touchpoint[],
    query: QueryAttributionDto,
  ) {
    const emailWindowHours = query.emailWindowHours ?? 72;
    const emailWindowMs = emailWindowHours * 3_600_000;

    return touchpoints.filter((tp) => {
      const diff = order.placedAt.getTime() - tp.createdAt.getTime();
      return diff >= 0 && diff <= emailWindowMs;
    });
  }

  private getFallbackTouchpoints(
    order: RevenueOrder,
    query: QueryAttributionDto,
  ): Touchpoint[] {
    const sourceChannel = (order.sourceChannel ?? 'organic').toLowerCase();

    if (sourceChannel === 'email' || !order.contactCreatedAt) {
      return [];
    }

    const dayMs = 24 * 3_600_000;
    const windowMs =
      sourceChannel === 'google'
        ? (query.googleWindowDays ?? 7) * dayMs
        : (query.organicWindowDays ?? 30) * dayMs;
    const diff = order.placedAt.getTime() - order.contactCreatedAt.getTime();

    if (diff < 0 || diff > windowMs) {
      return [];
    }

    return [
      {
        campaignId: `channel:${sourceChannel}`,
        contactId: order.contactId,
        channel: sourceChannel,
        type: 'SOURCE',
        createdAt: order.contactCreatedAt,
      },
    ];
  }

  private normalizeModel(model?: AttributionModel): CanonicalAttributionModel {
    const map: Record<AttributionModel, CanonicalAttributionModel> = {
      [AttributionModel.LAST_TOUCH]: 'last_touch',
      [AttributionModel.LAST_CLICK]: 'last_touch',
      [AttributionModel.FIRST_TOUCH]: 'first_touch',
      [AttributionModel.FIRST_CLICK]: 'first_touch',
      [AttributionModel.LINEAR]: 'linear',
      [AttributionModel.TIME_DECAY]: 'time_decay',
      [AttributionModel.POSITION_BASED]: 'position_based',
    };

    return model ? (map[model] ?? 'last_touch') : 'last_touch';
  }

  private resolveLookbackDays(query: QueryAttributionDto) {
    const emailDays = Math.ceil((query.emailWindowHours ?? 72) / 24);
    return Math.max(
      query.lookbackDays ?? 30,
      emailDays,
      query.googleWindowDays ?? 7,
      query.organicWindowDays ?? 30,
    );
  }

  private parseStartDate(value: string) {
    return value.length === 10
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value);
  }

  private parseEndDate(value: string) {
    return value.length === 10
      ? new Date(`${value}T23:59:59.999Z`)
      : new Date(value);
  }
}
