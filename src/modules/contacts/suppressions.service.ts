import { Injectable } from '@nestjs/common';
import { OrderStatus, SegmentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class SuppressionsService {
  private readonly purchaseStatuses = [
    OrderStatus.PAID,
    OrderStatus.FULFILLED,
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  private getCutoff(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  async getRecentBuyers(tenantId: string, days: number) {
    const cutoff = this.getCutoff(days);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        orders: {
          some: {
            status: { in: [...this.purchaseStatuses] },
            placedAt: { gte: cutoff },
          },
        },
      },
      include: {
        orders: {
          where: {
            status: { in: [...this.purchaseStatuses] },
            placedAt: { gte: cutoff },
          },
          orderBy: { placedAt: 'desc' },
        },
      },
    });

    return contacts.map((contact) => {
      const orders = Array.isArray(contact.orders) ? contact.orders : [];

      return {
        contactId: contact.id,
        email: contact.email,
        lastOrderAt: orders[0]?.placedAt ?? null,
        totalOrders: orders.length,
      };
    });
  }

  async getOrCreateSuppressionSegment(tenantId: string) {
    const existing = await this.prisma.segment.findFirst({
      where: {
        tenantId,
        name: 'Recent Buyers',
        type: SegmentType.STATIC,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.segment.create({
      data: {
        tenantId,
        name: 'Recent Buyers',
        type: SegmentType.STATIC,
        conditions: { operator: 'AND', rules: [] },
        contactCount: 0,
      },
    });
  }

  async syncRecentBuyersSegment(tenantId: string, days: number) {
    const buyers = await this.getRecentBuyers(tenantId, days);
    const segment = await this.getOrCreateSuppressionSegment(tenantId);

    await this.prisma.$transaction([
      this.prisma.segmentMember.deleteMany({
        where: { segmentId: segment.id },
      }),
      ...(buyers.length > 0
        ? [
            this.prisma.segmentMember.createMany({
              data: buyers.map((buyer) => ({
                segmentId: segment.id,
                contactId: buyer.contactId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
      this.prisma.segment.update({
        where: { id: segment.id },
        data: {
          contactCount: buyers.length,
          lastSyncAt: new Date(),
        },
      }),
    ]);

    return { segmentId: segment.id, count: buyers.length };
  }

  async syncSuppressionsToAds(tenantId: string) {
    const buyers = await this.getRecentBuyers(tenantId, 30);

    const audience = await this.prisma.adAudience.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name: 'Suppression List',
        },
      },
      update: {
        memberCount: buyers.length,
        lastSyncAt: new Date(),
      },
      create: {
        tenantId,
        name: 'Suppression List',
        memberCount: buyers.length,
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.adAudienceMember.deleteMany({
      where: { audienceId: audience.id },
    });

    if (buyers.length > 0) {
      await this.prisma.adAudienceMember.createMany({
        data: buyers.map((buyer) => ({
          audienceId: audience.id,
          contactId: buyer.contactId,
        })),
        skipDuplicates: true,
      });
    }

    await this.prisma.adAudience.update({
      where: { id: audience.id },
      data: {
        memberCount: buyers.length,
        lastSyncAt: new Date(),
      },
    });

    return { audienceId: audience.id, memberCount: buyers.length };
  }

  async shouldSuppressContact(
    tenantId: string,
    contactId: string,
    days: number,
  ) {
    const cutoff = this.getCutoff(days);

    const order = await this.prisma.order.findFirst({
      where: {
        contactId,
        status: { in: [...this.purchaseStatuses] },
        placedAt: { gte: cutoff },
        contact: { tenantId },
      },
      select: { id: true },
    });

    return Boolean(order);
  }
}
