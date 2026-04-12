import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

type OrderItemInput = {
  name: string;
  productId?: string | null;
  productExternalId?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type CreateOrderInput = Omit<CreateOrderDto, 'placedAt' | 'items'> & {
  placedAt: string | Date;
  items: OrderItemInput[];
  source?: string;
  rawPayload?: unknown;
  emitFlows?: boolean;
};

export type UpsertExternalOrderInput = CreateOrderInput & {
  externalId: string;
};

type OrderMetricRow = {
  totalAmount: Prisma.Decimal;
  placedAt: Date;
};

type UpdateStatusInput = UpdateOrderStatusDto | OrderStatus;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async create(tenantId: string, dto: CreateOrderInput) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await this.findOrCreateContact(
        tx,
        tenantId,
        dto.contactEmail,
      );
      const externalId = dto.externalId ?? this.buildExternalId(tenantId);
      const productsById = await this.resolveProductsById(
        tx,
        tenantId,
        dto.items,
      );

      const order = await tx.order.create({
        data: {
          tenantId,
          contactId: contact.id,
          externalId,
          orderNumber: dto.orderNumber,
          status: dto.status,
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          subtotal:
            dto.subtotal === undefined || dto.subtotal === null
              ? null
              : new Prisma.Decimal(dto.subtotal),
          currency: dto.currency,
          source: dto.source ?? 'manual',
          ...(dto.rawPayload === undefined
            ? {}
            : {
                rawPayload: this.toInputJsonValue(dto.rawPayload),
              }),
          placedAt: this.toOrderDate(dto.placedAt),
        },
      });

      if (dto.items.length > 0) {
        await tx.orderItem.createMany({
          data: this.buildOrderItemsData(
            tenantId,
            order.id,
            externalId,
            dto.items,
            productsById,
          ),
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
  }

  async upsertExternalOrder(tenantId: string, dto: UpsertExternalOrderInput) {
    const existing = await this.prisma.order.findUnique({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId: dto.externalId,
        },
      },
      select: {
        id: true,
        status: true,
        contactId: true,
      },
    });

    if (!existing) {
      return this.create(tenantId, dto);
    }

    if (existing.status !== dto.status) {
      await this.updateStatus(tenantId, existing.id, dto.status);
    }

    return this.syncExternalSnapshot(
      tenantId,
      existing.id,
      existing.contactId,
      dto,
    );
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

  async updateStatus(tenantId: string, id: string, input: UpdateStatusInput) {
    const nextStatus = this.getStatusValue(input);
    const { order } = await this.prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });

      if (!currentOrder) {
        throw new NotFoundException('Order not found');
      }

      const nextOrder = await tx.order.update({
        where: { id: currentOrder.id },
        data: { status: nextStatus },
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
        order: nextOrder,
      };
    });

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

  private isStockReleasedStatus(status: OrderStatus) {
    return status === OrderStatus.CANCELLED || status === OrderStatus.REFUNDED;
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

  private getStatusValue(input: UpdateStatusInput): OrderStatus {
    return typeof input === 'string' ? input : input.status;
  }

  private async syncExternalSnapshot(
    tenantId: string,
    orderId: string,
    previousContactId: string,
    dto: UpsertExternalOrderInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await this.findOrCreateContact(
        tx,
        tenantId,
        dto.contactEmail,
      );
      const productsById = await this.resolveProductsById(
        tx,
        tenantId,
        dto.items,
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          contactId: contact.id,
          orderNumber: dto.orderNumber,
          status: dto.status,
          totalAmount: new Prisma.Decimal(dto.totalAmount),
          subtotal:
            dto.subtotal === undefined || dto.subtotal === null
              ? null
              : new Prisma.Decimal(dto.subtotal),
          currency: dto.currency,
          source: dto.source ?? 'manual',
          ...(dto.rawPayload === undefined
            ? {}
            : {
                rawPayload: this.toInputJsonValue(dto.rawPayload),
              }),
          placedAt: this.toOrderDate(dto.placedAt),
        },
      });

      await tx.orderItem.deleteMany({
        where: { orderId },
      });

      if (dto.items.length > 0) {
        await tx.orderItem.createMany({
          data: this.buildOrderItemsData(
            tenantId,
            orderId,
            dto.externalId,
            dto.items,
            productsById,
          ),
        });
      }

      await this.recalculateContactMetrics(tx, contact.id);
      if (contact.id !== previousContactId) {
        await this.recalculateContactMetrics(tx, previousContactId);
      }

      const updated = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        include: { items: true },
      });

      if (!updated) {
        throw new NotFoundException('Order not found');
      }

      return updated;
    });
  }

  private async resolveProductsById(
    client: PrismaLike,
    tenantId: string,
    items: OrderItemInput[],
  ) {
    const productsById = new Map<string, { id: string; externalId: string }>();

    for (const item of items) {
      if (!item.productId) {
        continue;
      }

      const product = await client.product.findFirst({
        where: { id: item.productId, tenantId },
        select: { id: true, externalId: true },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      productsById.set(item.productId, product);
    }

    return productsById;
  }

  private buildOrderItemsData(
    tenantId: string,
    orderId: string,
    orderExternalId: string,
    items: OrderItemInput[],
    productsById: Map<string, { id: string; externalId: string }>,
  ) {
    return items.map((item, index) => ({
      tenantId,
      orderId,
      externalId: `${orderExternalId}:${index}`,
      productId: item.productId ?? null,
      productExternalId:
        item.productExternalId ??
        (item.productId
          ? (productsById.get(item.productId)?.externalId ?? null)
          : null),
      name: item.name,
      sku: item.sku ?? null,
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      totalPrice: new Prisma.Decimal(item.totalPrice),
    }));
  }

  private toOrderDate(input: string | Date) {
    return input instanceof Date ? input : new Date(input);
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
