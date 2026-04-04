import { Injectable, Logger } from '@nestjs/common';
import { FlowStatus, InsightType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type ProductFlowUsage = {
  productId: string;
  externalId: string;
  sku: string | null;
  name: string;
  activeFlows: number;
};

type ProductRecord = {
  id: string;
  externalId: string;
  sku: string | null;
  name: string;
};

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

    const [products, flows, orderItems, recentAlerts] = await Promise.all([
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
          nodes: true,
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

    if (
      products.length === 0 ||
      flows.length === 0 ||
      orderItems.length === 0
    ) {
      return { created: 0 };
    }

    const flowUsage = this.mapProductFlowUsage(products, flows);
    const quantitiesByKey = this.aggregateQuantities(orderItems);

    let created = 0;

    for (const product of products) {
      const usage = flowUsage.get(product.id);
      if (!usage || usage.activeFlows <= 0) {
        continue;
      }

      const orders30j = this.resolveQuantity(product, quantitiesByKey);
      if (orders30j <= 10) {
        continue;
      }

      if (this.hasRecentAlert(product, recentAlerts)) {
        continue;
      }

      await this.prisma.insight.create({
        data: {
          tenantId,
          type: InsightType.ANOMALY,
          title: `Stock a surveiller - ${product.name}`,
          description: `${orders30j} ventes/30j. Dans ${usage.activeFlows} flow(s) actif(s).`,
          data: {
            productId: product.id,
            orders30j,
            activeFlows: usage.activeFlows,
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
    product: ProductRecord,
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

  private mapProductFlowUsage(
    products: ProductRecord[],
    flows: Array<{ id: string; nodes: unknown }>,
  ) {
    const productByExternalId = new Map(
      products.map((product) => [product.externalId, product]),
    );
    const productBySku = new Map(
      products
        .filter((product) => product.sku)
        .map((product) => [product.sku!.toLowerCase(), product]),
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    const usageByProductId = new Map<string, ProductFlowUsage>();

    for (const flow of flows) {
      const productIds = new Set<string>();
      this.collectProductReferences(flow.nodes, productIds, {
        productByExternalId,
        productById,
        productBySku,
      });

      for (const productId of productIds) {
        const product = productById.get(productId);
        if (!product) {
          continue;
        }

        const current = usageByProductId.get(productId) ?? {
          productId,
          externalId: product.externalId,
          sku: product.sku,
          name: product.name,
          activeFlows: 0,
        };

        current.activeFlows += 1;
        usageByProductId.set(productId, current);
      }
    }

    return usageByProductId;
  }

  private collectProductReferences(
    value: unknown,
    productIds: Set<string>,
    indexes: {
      productByExternalId: Map<string, ProductRecord>;
      productById: Map<string, ProductRecord>;
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
      productByExternalId: Map<string, ProductRecord>;
      productById: Map<string, ProductRecord>;
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

  private hasRecentAlert(product: ProductRecord, recentAlerts: RecentAlert[]) {
    return recentAlerts.some((alert) => {
      if (alert.title === `Stock a surveiller - ${product.name}`) {
        return true;
      }

      if (!alert.data || typeof alert.data !== 'object') {
        return false;
      }

      return (alert.data as { productId?: string }).productId === product.id;
    });
  }
}
