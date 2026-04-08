import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { SuppressionsService } from '../contacts/suppressions.service';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { FlowsService } from '../flows/flows.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

type OrderMetricRow = {
  totalAmount: Prisma.Decimal;
  placedAt: Date;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowsService: FlowsService,
    private readonly suppressionsService: SuppressionsService,
    private readonly productsService: ProductsService,
  ) {}

  async create(tenantId: string, dto: CreateOrderDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const contact = await this.findOrCreateContact(
        tx,
        tenantId,
        dto.contactEmail,
      );
      const externalId = dto.externalId ?? this.buildExternalId(tenantId);
      const productsById = new Map<
        string,
        { id: string; externalId: string }
      >();

      for (const item of dto.items) {
        if (!item.productId || productsById.has(item.productId)) {
          continue;
        }

        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            tenantId,
            isActive: true,
          },
          select: {
            id: true,
            externalId: true,
          },
        });

        if (!product) {
          throw new NotFoundException(`Produit ${item.productId} introuvable`);
        }

        productsById.set(item.productId, product);
      }

      const order = await tx.order.create({
        data: {
          tenantId,
          contactId: contact.id,
          externalId,
          orderNumber: dto.orderNumber,
          status: dto.status,
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          subtotal:
            dto.subtotal === undefined
              ? null
              : new Prisma.Decimal(dto.subtotal),
          currency: dto.currency,
          source: 'manual',
          placedAt: new Date(dto.placedAt),
        },
      });

      if (dto.items.length > 0) {
        await tx.orderItem.createMany({
          data: dto.items.map((item, index) => {
            const product = item.productId
              ? (productsById.get(item.productId) ?? null)
              : null;

            return {
              tenantId,
              orderId: order.id,
              externalId: `${externalId}-item-${index + 1}`,
              productId: product?.id ?? null,
              productExternalId: product?.externalId ?? null,
              name: item.name,
              sku: null,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              totalPrice: new Prisma.Decimal(item.totalPrice),
            };
          }),
        });

        if (!this.isStockReleasedStatus(dto.status)) {
          for (const item of dto.items) {
            if (!item.productId) {
              continue;
            }

            await this.productsService.decrementStock(
              tenantId,
              item.productId,
              item.quantity,
              tx,
            );
          }
        }
      }

      await this.recalculateContactMetrics(tx, contact.id);

      const created = await tx.order.findFirst({
        where: { id: order.id, tenantId },
        include: { items: true },
      });

      if (!created) {
        throw new NotFoundException('Order not found');
      }

      return created;
    });

    const triggerTypes = [FlowTriggerType.ORDER_CREATED];

    if (this.isPostPurchaseStatus(result.status)) {
      triggerTypes.unshift(FlowTriggerType.POST_PURCHASE);
      this.syncSuppressionTargets(tenantId);
    }

    this.triggerFlows(tenantId, result.contactId, triggerTypes);

    return result;
  }

  async findAll(tenantId: string, query: QueryOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { placedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateOrderStatusDto) {
    const { existing, order } = await this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });

      if (!currentOrder) {
        throw new NotFoundException('Order not found');
      }

      const nextOrder = await tx.order.update({
        where: { id: currentOrder.id },
        data: { status: dto.status },
        include: { items: true },
      });

      if (
        !this.isStockReleasedStatus(currentOrder.status) &&
        this.isStockReleasedStatus(nextOrder.status)
      ) {
        for (const item of currentOrder.items) {
          if (!item.productId) {
            continue;
          }

          await this.productsService.restoreStock(
            tenantId,
            item.productId,
            item.quantity,
            tx,
          );
        }
      }

      if (
        this.isStockReleasedStatus(currentOrder.status) &&
        !this.isStockReleasedStatus(nextOrder.status)
      ) {
        for (const item of currentOrder.items) {
          if (!item.productId) {
            continue;
          }

          await this.productsService.decrementStock(
            tenantId,
            item.productId,
            item.quantity,
            tx,
          );
        }
      }

      await this.recalculateContactMetrics(tx, currentOrder.contactId);

      return {
        existing: currentOrder,
        order: nextOrder,
      };
    });

    if (
      !this.isPostPurchaseStatus(existing.status) &&
      this.isPostPurchaseStatus(order.status)
    ) {
      this.syncSuppressionTargets(tenantId);
      this.triggerFlows(tenantId, existing.contactId, [
        FlowTriggerType.POST_PURCHASE,
      ]);
    }

    return order;
  }

  private async findOrCreateContact(
    client: PrismaLike,
    tenantId: string,
    email: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await client.contact.findFirst({
      where: { tenantId, email: normalizedEmail },
    });

    if (existing) {
      return existing;
    }

    return client.contact.create({
      data: {
        tenantId,
        email: normalizedEmail,
        sourceChannel: 'manual',
      },
    });
  }

  private isPostPurchaseStatus(status: OrderStatus) {
    return status === OrderStatus.PAID || status === OrderStatus.FULFILLED;
  }

  private isStockReleasedStatus(status: OrderStatus) {
    return status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED;
  }

  private triggerFlows(
    tenantId: string,
    contactId: string,
    triggerTypes: FlowTriggerType[],
  ): void {
    for (const type of triggerTypes) {
      void this.flowsService.triggerFlowsSafe(tenantId, type, contactId);
    }
  }

  private syncSuppressionTargets(tenantId: string): void {
    void Promise.all([
      this.suppressionsService.syncRecentBuyersSegment(tenantId, 30),
      this.suppressionsService.syncSuppressionsToAds(tenantId),
    ]);
  }

  private async recalculateContactMetrics(
    client: PrismaLike,
    contactId: string,
  ): Promise<void> {
    const paidOrders = (await client.order.findMany({
      where: {
        contactId,
        status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] },
      },
      select: {
        totalAmount: true,
        placedAt: true,
      },
      orderBy: { placedAt: 'asc' },
    })) as OrderMetricRow[];

    const totalOrders = paidOrders.length;
    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum.plus(order.totalAmount),
      new Prisma.Decimal(0),
    );

    await client.contact.update({
      where: { id: contactId },
      data: {
        totalOrders,
        totalRevenue,
        firstOrderAt: paidOrders[0]?.placedAt ?? null,
        lastOrderAt: paidOrders[paidOrders.length - 1]?.placedAt ?? null,
      },
    });
  }

  private buildExternalId(tenantId: string) {
    return `manual-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
