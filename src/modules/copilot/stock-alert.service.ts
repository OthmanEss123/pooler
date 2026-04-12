import { Injectable, Logger } from '@nestjs/common';
import { InsightType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type RecentAlert = {
  title: string;
  data: unknown;
};

@Injectable()
export class StockAlertService {
  private readonly logger = new Logger(StockAlertService.name);
  private readonly paidStatuses = [OrderStatus.PAID, OrderStatus.FULFILLED];

  constructor(private readonly prisma: PrismaService) {}

  async detectLowStock(tenantId: string) {
    const since30Days = new Date();
    since30Days.setDate(since30Days.getDate() - 30);

    const since48Hours = new Date();
    since48Hours.setHours(since48Hours.getHours() - 48);

    const [products, orderItems, recentAlerts] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          tenantId,
          isActive: true,
          trackStock: true,
          stockQuantity: {
            not: null,
          },
        },
        select: {
          id: true,
          externalId: true,
          sku: true,
          name: true,
          stockQuantity: true,
          lowStockAlert: true,
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          tenantId,
          order: {
            status: {
              in: this.paidStatuses,
            },
            placedAt: {
              gte: since30Days,
            },
          },
        },
        select: {
          productExternalId: true,
          sku: true,
          name: true,
          quantity: true,
        },
      }),
      this.prisma.insight.findMany({
        where: {
          tenantId,
          type: InsightType.ANOMALY,
          createdAt: {
            gte: since48Hours,
          },
        },
        select: {
          title: true,
          data: true,
        },
      }),
    ]);

    if (products.length === 0 || orderItems.length === 0) {
      return { created: 0 };
    }

    const quantitiesByKey = this.aggregateQuantities(orderItems);
    let created = 0;

    for (const product of products) {
      const stockQuantity = Number(product.stockQuantity ?? 0);
      const threshold = Math.max(Number(product.lowStockAlert ?? 5), 1);
      const orders30j = this.resolveQuantity(product, quantitiesByKey);

      if (orders30j <= 0 || stockQuantity > threshold) {
        continue;
      }

      if (this.hasRecentAlert(product.id, recentAlerts)) {
        continue;
      }

      await this.prisma.insight.create({
        data: {
          tenantId,
          type: InsightType.ANOMALY,
          title: `Stock a surveiller - ${product.name}`,
          description: `${orders30j} ventes/30j et ${stockQuantity} unite(s) restantes.`,
          data: {
            productId: product.id,
            orders30j,
            stockQuantity,
            threshold,
          },
        },
      });

      created += 1;
    }

    this.logger.log(
      `Stock alerts generated for tenant=${tenantId}: ${created}`,
    );
    return { created };
  }

  private aggregateQuantities(
    orderItems: Array<{
      productExternalId: string | null;
      sku: string | null;
      name: string;
      quantity: number;
    }>,
  ) {
    const totals = new Map<string, number>();

    for (const item of orderItems) {
      const keys = [
        item.productExternalId ? `external:${item.productExternalId}` : null,
        item.sku ? `sku:${item.sku.toLowerCase()}` : null,
        `name:${item.name.trim().toLowerCase()}`,
      ].filter((value): value is string => Boolean(value));

      for (const key of keys) {
        totals.set(key, (totals.get(key) ?? 0) + Number(item.quantity ?? 0));
      }
    }

    return totals;
  }

  private resolveQuantity(
    product: {
      externalId: string;
      sku: string | null;
      name: string;
    },
    quantitiesByKey: Map<string, number>,
  ) {
    const keys = [
      `external:${product.externalId}`,
      product.sku ? `sku:${product.sku.toLowerCase()}` : null,
      `name:${product.name.trim().toLowerCase()}`,
    ].filter((value): value is string => Boolean(value));

    return keys.reduce(
      (highest, key) => Math.max(highest, quantitiesByKey.get(key) ?? 0),
      0,
    );
  }

  private hasRecentAlert(productId: string, recentAlerts: RecentAlert[]) {
    return recentAlerts.some((alert) => {
      if (
        !alert.data ||
        typeof alert.data !== 'object' ||
        Array.isArray(alert.data)
      ) {
        return false;
      }

      return (alert.data as Record<string, unknown>).productId === productId;
    });
  }
}
