import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics() {
    const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      tenantsActive,
      contactsTotal,
      ordersPaid30d,
      productsActive,
      insightsUnread,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { isActive: true } }),
      this.prisma.contact.count(),
      this.prisma.order.count({
        where: {
          status: {
            in: [OrderStatus.PAID, OrderStatus.FULFILLED],
          },
          placedAt: {
            gte: since30Days,
          },
        },
      }),
      this.prisma.product.count({ where: { isActive: true } }),
      this.prisma.insight.count({ where: { isRead: false } }),
    ]);

    return {
      tenantsActive,
      contactsTotal,
      ordersPaid30d,
      productsActive,
      insightsUnread,
    };
  }
}
