import {
  AttributionSummaryItem,
  AttributionCampaignItem,
} from './types/analytics.types';
import { Injectable } from '@nestjs/common';
import { EmailEventType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  AttributionModel,
  QueryAttributionDto,
} from './dto/query-attribution.dto';

type Touchpoint = {
  campaignId: string;
  contactId: string;
  type: EmailEventType;
  createdAt: Date;
};

type RevenueOrder = {
  contactId: string;
  totalAmount: number;
  placedAt: Date;
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

  constructor(private readonly prisma: PrismaService) {}

  async getAttributionSummary(
    tenantId: string,
    query: QueryAttributionDto,
  ): Promise<AttributionSummaryItem> {
    const model = query.model ?? 'last_touch';
    const limit = query.limit ?? 10;
    const lookbackDays = query.lookbackDays ?? 30;
    const fromDate = this.parseStartDate(query.from);
    const toDate = this.parseEndDate(query.to);
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
    }))) {
      const selectedTouchpoint = this.pickTouchpoint(
        touchpointsByContact.get(order.contactId) ?? [],
        order.placedAt,
        model,
      );

      if (!selectedTouchpoint) {
        unattributedRevenue += order.totalAmount;
        unattributedOrders += 1;
        continue;
      }

      const aggregate = this.getOrCreateAggregate(
        aggregates,
        selectedTouchpoint.campaignId,
      );
      aggregate.attributedRevenue += order.totalAmount;
      aggregate.attributedOrders += 1;
      attributedRevenue += order.totalAmount;
    }

    const campaignIds = [...aggregates.keys()];
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
      name: campaignId,
      attributedRevenue: 0,
      attributedOrders: 0,
      clicks: 0,
      opens: 0,
    };
    aggregates.set(campaignId, created);
    return created;
  }

  private pickTouchpoint(
    touchpoints: Touchpoint[],
    placedAt: Date,
    model: AttributionModel,
  ) {
    const eligible = touchpoints.filter(
      (touchpoint) => touchpoint.createdAt.getTime() <= placedAt.getTime(),
    );

    if (eligible.length === 0) {
      return null;
    }

    return model === 'first_touch'
      ? eligible[0]
      : eligible[eligible.length - 1];
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
