import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { SuppressionsService } from '../contacts/suppressions.service';
import { FlowsService } from '../flows/flows.service';

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
  ) {}

  async create(tenantId: string, dto: CreateOrderDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const contact = await this.findOrCreateContact(
        tx,
        tenantId,
        dto.contactEmail,
      );

      const order = await tx.order.create({
        data: {
          contactId: contact.id,
          externalId: dto.externalId,
          orderNumber: dto.orderNumber,
          status: dto.status,
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          subtotal:
            dto.subtotal === undefined
              ? null
              : new Prisma.Decimal(dto.subtotal),
          currency: dto.currency,
          placedAt: new Date(dto.placedAt),
        },
      });

      if (dto.items.length > 0) {
        await tx.orderItem.createMany({
          data: dto.items.map((item) => ({
            orderId: order.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            totalPrice: new Prisma.Decimal(item.totalPrice),
          })),
        });
      }

      await this.recalculateContactMetrics(tx, contact.id);

      const created = await tx.order.findFirst({
        where: { id: order.id, contact: { tenantId } },
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
      contact: { tenantId },
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
      where: { id, contact: { tenantId } },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateOrderStatusDto) {
    const existing = await this.prisma.order.findFirst({
      where: { id, contact: { tenantId } },
      select: { id: true, contactId: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Order not found');
    }

    const order = await this.prisma.order.update({
      where: { id: existing.id },
      data: { status: dto.status },
      include: { items: true },
    });

    await this.recalculateContactMetrics(this.prisma, existing.contactId);

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
      },
    });
  }

  private isPostPurchaseStatus(status: OrderStatus) {
    return status === OrderStatus.PAID || status === OrderStatus.FULFILLED;
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
}
