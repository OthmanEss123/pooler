import { Injectable } from '@nestjs/common';
import { RfmSegment } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type HealthScoreInput = {
  segment: RfmSegment;
  rfmScore: number;
  recencyScore: number;
  frequencyScore: number;
  monetaryScore: number;
  churnRisk: number;
  predictedLtv?: number;
};

@Injectable()
export class HealthScoreService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateForTenant(tenantId: string): Promise<{ processed: number }> {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      include: {
        orders: {
          select: {
            id: true,
            totalAmount: true,
            placedAt: true,
          },
          orderBy: {
            placedAt: 'desc',
          },
        },
      },
    });

    if (contacts.length === 0) {
      return { processed: 0 };
    }

    const revenues = contacts.map((contact) =>
      contact.orders.reduce((sum, order) => sum + Number(order.totalAmount), 0),
    );
    const sortedRevenues = [...revenues].sort((left, right) => left - right);

    for (const contact of contacts) {
      const totalOrders = contact.orders.length;
      const totalRevenue = contact.orders.reduce(
        (sum, order) => sum + Number(order.totalAmount),
        0,
      );
      const lastOrderAt = contact.orders[0]?.placedAt ?? null;
      const daysSinceLastOrder = lastOrderAt
        ? this.diffDays(lastOrderAt, new Date())
        : 9999;

      const recencyScore = this.calculateRecencyScore(daysSinceLastOrder);
      const frequencyScore = this.calculateFrequencyScore(totalOrders);
      const monetaryScore = this.calculateMonetaryScore(
        totalRevenue,
        sortedRevenues,
      );
      const rfmScore = Math.round(
        (recencyScore + frequencyScore + monetaryScore) / 3,
      );

      await this.upsertHealthScore(tenantId, contact.id, {
        segment: this.mapSegment(rfmScore),
        rfmScore,
        recencyScore,
        frequencyScore,
        monetaryScore,
        churnRisk: Number((1 - rfmScore / 100).toFixed(2)),
        predictedLtv: Number((totalRevenue * (1 + rfmScore / 100)).toFixed(2)),
      });
    }

    return { processed: contacts.length };
  }

  upsertHealthScore(
    tenantId: string,
    contactId: string,
    data: HealthScoreInput,
  ) {
    return this.prisma.customerHealthScore.upsert({
      where: { contactId },
      update: {
        tenantId,
        segment: data.segment,
        rfmScore: data.rfmScore,
        recencyScore: data.recencyScore,
        frequencyScore: data.frequencyScore,
        monetaryScore: data.monetaryScore,
        churnRisk: data.churnRisk,
        predictedLtv: data.predictedLtv,
        calculatedAt: new Date(),
      },
      create: {
        tenantId,
        contactId,
        segment: data.segment,
        rfmScore: data.rfmScore,
        recencyScore: data.recencyScore,
        frequencyScore: data.frequencyScore,
        monetaryScore: data.monetaryScore,
        churnRisk: data.churnRisk,
        predictedLtv: data.predictedLtv,
      },
    });
  }

  async getDistribution(tenantId: string): Promise<Record<RfmSegment, number>> {
    const scores = await this.prisma.customerHealthScore.findMany({
      where: { tenantId },
      select: { segment: true },
    });

    const distribution: Record<RfmSegment, number> = {
      [RfmSegment.CHAMPION]: 0,
      [RfmSegment.LOYAL]: 0,
      [RfmSegment.POTENTIAL]: 0,
      [RfmSegment.NEW]: 0,
      [RfmSegment.AT_RISK]: 0,
      [RfmSegment.CANT_LOSE]: 0,
      [RfmSegment.LOST]: 0,
    };

    for (const score of scores) {
      distribution[score.segment] += 1;
    }

    return distribution;
  }

  private calculateRecencyScore(days: number): number {
    if (days <= 0) return 100;
    if (days <= 30) return 70;
    if (days <= 90) return 40;
    if (days <= 180) return 10;
    return 0;
  }

  private calculateFrequencyScore(totalOrders: number): number {
    if (totalOrders >= 10) return 100;
    if (totalOrders >= 5) return 70;
    if (totalOrders >= 3) return 50;
    if (totalOrders >= 1) return 20;
    return 0;
  }

  private calculateMonetaryScore(
    totalRevenue: number,
    sortedRevenues: number[],
  ): number {
    if (sortedRevenues.length === 0) {
      return 0;
    }

    const position = sortedRevenues.findIndex((value) => value >= totalRevenue);
    return position === -1
      ? 100
      : Math.round((position / Math.max(sortedRevenues.length - 1, 1)) * 100);
  }

  private mapSegment(score: number): RfmSegment {
    if (score >= 80) return RfmSegment.CHAMPION;
    if (score >= 65) return RfmSegment.LOYAL;
    if (score >= 50) return RfmSegment.POTENTIAL;
    if (score >= 35) return RfmSegment.NEW;
    if (score >= 20) return RfmSegment.AT_RISK;
    if (score >= 10) return RfmSegment.CANT_LOSE;
    return RfmSegment.LOST;
  }

  private diffDays(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }
}
