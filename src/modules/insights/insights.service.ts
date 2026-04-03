import { Injectable, NotFoundException } from '@nestjs/common';
import { InsightType, OrderStatus, Prisma, type Insight } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type CreateInsightInput = {
  type: InsightType;
  title: string;
  description?: string;
  data?: Prisma.InputJsonValue;
  impact?: Prisma.Decimal | number | null;
  expiresAt?: Date | null;
};

type ProductAggregate = {
  name: string;
  revenue: number;
  quantity: number;
};

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, unreadOnly?: boolean) {
    return this.prisma.insight.findMany({
      where: {
        tenantId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async markAsRead(tenantId: string, id: string) {
    const insight = await this.prisma.insight.findFirst({
      where: { id, tenantId },
    });

    if (!insight) {
      throw new NotFoundException('Insight introuvable');
    }

    return this.prisma.insight.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const insight = await this.prisma.insight.findFirst({
      where: { id, tenantId },
    });

    if (!insight) {
      throw new NotFoundException('Insight introuvable');
    }

    await this.prisma.insight.delete({
      where: { id },
    });
  }

  async generateInsights(tenantId: string): Promise<{ created: number }> {
    const results = await Promise.all([
      this.detectRevenueDrop(tenantId),
      this.detectAtRiskCustomers(tenantId),
      this.detectTopProduct(tenantId),
      this.detectEmailPerformance(tenantId),
    ]);

    return {
      created: results.reduce(
        (count, result) => count + (result === null ? 0 : 1),
        0,
      ),
    };
  }

  private async createInsightIfNotDuplicate(
    tenantId: string,
    input: CreateInsightInput,
  ): Promise<Insight | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await this.prisma.insight.findFirst({
      where: {
        tenantId,
        type: input.type,
        createdAt: {
          gte: since,
        },
      },
    });

    if (existing) {
      return null;
    }

    return this.prisma.insight.create({
      data: {
        tenantId,
        type: input.type,
        title: input.title,
        description: input.description,
        data: input.data,
        impact:
          input.impact !== undefined && input.impact !== null
            ? new Prisma.Decimal(input.impact)
            : null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  private async detectRevenueDrop(tenantId: string): Promise<Insight | null> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const historyStart = new Date(todayStart);
    historyStart.setDate(historyStart.getDate() - 7);

    const orders = await this.prisma.order.findMany({
      where: {
        contact: { tenantId },
        status: {
          in: [OrderStatus.PAID, OrderStatus.FULFILLED],
        },
        placedAt: {
          gte: historyStart,
        },
      },
      select: {
        totalAmount: true,
        placedAt: true,
      },
    });

    const todayRevenue = orders
      .filter((order) => order.placedAt >= todayStart)
      .reduce((sum, order) => sum + Number(order.totalAmount), 0);

    const past7Days = Array.from({ length: 7 }, (_, index) => {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - (index + 1));

      const end = new Date(todayStart);
      end.setDate(end.getDate() - index);

      return orders
        .filter((order) => order.placedAt >= start && order.placedAt < end)
        .reduce((sum, order) => sum + Number(order.totalAmount), 0);
    });

    const avg7Days =
      past7Days.length > 0
        ? past7Days.reduce((sum, revenue) => sum + revenue, 0) /
          past7Days.length
        : 0;

    if (avg7Days <= 0) {
      return null;
    }

    const ratio = todayRevenue / avg7Days;

    if (ratio < 0.5) {
      return this.createInsightIfNotDuplicate(tenantId, {
        type: InsightType.ANOMALY,
        title: 'Chute critique du revenu',
        description:
          'Le revenu du jour est inferieur a 50% de la moyenne des 7 derniers jours.',
        data: {
          todayRevenue,
          avg7Days,
          ratio,
          severity: 'HIGH',
        },
        impact: avg7Days - todayRevenue,
      });
    }

    if (ratio < 0.75) {
      return this.createInsightIfNotDuplicate(tenantId, {
        type: InsightType.ANOMALY,
        title: 'Baisse du revenu detectee',
        description:
          'Le revenu du jour est inferieur a 75% de la moyenne des 7 derniers jours.',
        data: {
          todayRevenue,
          avg7Days,
          ratio,
          severity: 'MEDIUM',
        },
        impact: avg7Days - todayRevenue,
      });
    }

    return null;
  }

  private async detectAtRiskCustomers(
    tenantId: string,
  ): Promise<Insight | null> {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
      },
      select: {
        id: true,
        orders: {
          select: {
            placedAt: true,
          },
          orderBy: {
            placedAt: 'desc',
          },
          take: 1,
        },
      },
    });

    if (contacts.length === 0) {
      return null;
    }

    const atRiskCount = contacts.filter((contact) => {
      const lastOrder = contact.orders[0];
      return !lastOrder || lastOrder.placedAt < sixtyDaysAgo;
    }).length;

    const ratio = atRiskCount / contacts.length;

    if (ratio <= 0.1) {
      return null;
    }

    return this.createInsightIfNotDuplicate(tenantId, {
      type: InsightType.SEGMENT_OPPORTUNITY,
      title: 'Clients a risque detectes',
      description: `${atRiskCount} contacts n'ont pas commande depuis plus de 60 jours.`,
      data: {
        totalContacts: contacts.length,
        atRiskCount,
        ratio,
      },
    });
  }

  private async detectTopProduct(tenantId: string): Promise<Insight | null> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          contact: { tenantId },
          status: {
            in: [OrderStatus.PAID, OrderStatus.FULFILLED],
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

    if (items.length === 0) {
      return null;
    }

    const productMap = new Map<string, ProductAggregate>();

    for (const item of items) {
      const existing = productMap.get(item.name) ?? {
        name: item.name,
        revenue: 0,
        quantity: 0,
      };

      existing.revenue += Number(item.totalPrice);
      existing.quantity += item.quantity;

      productMap.set(item.name, existing);
    }

    const topEntry = [...productMap.entries()].sort(
      (left, right) => right[1].revenue - left[1].revenue,
    )[0];

    if (!topEntry) {
      return null;
    }

    const [topProductName, topProduct] = topEntry;

    return this.createInsightIfNotDuplicate(tenantId, {
      type: InsightType.PRODUCT_INTELLIGENCE,
      title: 'Produit top performer',
      description: `${topProduct.name} a genere le plus de revenu sur les 30 derniers jours.`,
      data: {
        productName: topProductName,
        revenue: topProduct.revenue,
        quantity: topProduct.quantity,
      },
      impact: topProduct.revenue,
    });
  }

  private async detectEmailPerformance(
    tenantId: string,
  ): Promise<Insight | null> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        name: true,
        totalSent: true,
        totalOpened: true,
      },
    });

    if (campaigns.length === 0) {
      return null;
    }

    const totals = campaigns.reduce(
      (accumulator, campaign) => ({
        sent: accumulator.sent + campaign.totalSent,
        opens: accumulator.opens + campaign.totalOpened,
      }),
      { sent: 0, opens: 0 },
    );

    if (totals.sent <= 0) {
      return null;
    }

    const openRate = (totals.opens / totals.sent) * 100;

    if (openRate >= 15) {
      return null;
    }

    return this.createInsightIfNotDuplicate(tenantId, {
      type: InsightType.EMAIL_PERFORMANCE,
      title: 'Performance email faible',
      description:
        "Le taux d'ouverture moyen sur 30 jours est inferieur a 15%.",
      data: {
        sent: totals.sent,
        opens: totals.opens,
        openRate,
      },
    });
  }
}
