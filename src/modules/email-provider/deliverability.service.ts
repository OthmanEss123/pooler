import { Injectable } from '@nestjs/common';
import {
  EmailEventType,
  EmailStatus,
  InsightType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  BounceRateResult,
  ComplaintRateResult,
  DeliverabilityReport,
} from './types/deliverability.types';

@Injectable()
export class DeliverabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private getCutoff(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  private round(value: number, precision = 2): number {
    return Number(value.toFixed(precision));
  }

  private async createInsightIfMissing(
    tenantId: string,
    title: string,
    description: string,
    data: Prisma.JsonObject,
  ): Promise<void> {
    const recentWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const existing = await this.prisma.insight.findFirst({
      where: {
        tenantId,
        type: InsightType.EMAIL_PERFORMANCE,
        title,
        createdAt: { gte: recentWindow },
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.prisma.insight.create({
      data: {
        tenantId,
        type: InsightType.EMAIL_PERFORMANCE,
        title,
        description,
        data,
      },
    });
  }

  async getBounceRate(
    tenantId: string,
    days: number,
  ): Promise<BounceRateResult> {
    const cutoff = this.getCutoff(days);

    const [bounced, sent] = await this.prisma.$transaction([
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.BOUNCED,
          createdAt: { gte: cutoff },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.SENT,
          createdAt: { gte: cutoff },
        },
      }),
    ]);

    const rate = sent > 0 ? this.round((bounced / sent) * 100) : 0;
    const status = rate > 5 ? 'critical' : rate >= 2 ? 'warning' : 'good';

    return { rate, bounced, sent, status };
  }

  async getComplaintRate(
    tenantId: string,
    days: number,
  ): Promise<ComplaintRateResult> {
    const cutoff = this.getCutoff(days);

    const [complained, sent] = await this.prisma.$transaction([
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.COMPLAINED,
          createdAt: { gte: cutoff },
        },
      }),
      this.prisma.emailEvent.count({
        where: {
          tenantId,
          type: EmailEventType.SENT,
          createdAt: { gte: cutoff },
        },
      }),
    ]);

    const rate = sent > 0 ? this.round((complained / sent) * 100, 4) : 0;
    const status = rate > 0.1 ? 'critical' : rate >= 0.05 ? 'warning' : 'good';

    return { rate, complained, sent, status };
  }

  async getDeliverabilityReport(
    tenantId: string,
    days: number,
  ): Promise<DeliverabilityReport> {
    const cutoff = this.getCutoff(days);

    const [bounceRate, complaintRate, delivered, opened, clicked, sent] =
      await Promise.all([
        this.getBounceRate(tenantId, days),
        this.getComplaintRate(tenantId, days),
        this.prisma.emailEvent.count({
          where: {
            tenantId,
            type: EmailEventType.DELIVERED,
            createdAt: { gte: cutoff },
          },
        }),
        this.prisma.emailEvent.count({
          where: {
            tenantId,
            type: EmailEventType.OPENED,
            createdAt: { gte: cutoff },
          },
        }),
        this.prisma.emailEvent.count({
          where: {
            tenantId,
            type: EmailEventType.CLICKED,
            createdAt: { gte: cutoff },
          },
        }),
        this.prisma.emailEvent.count({
          where: {
            tenantId,
            type: EmailEventType.SENT,
            createdAt: { gte: cutoff },
          },
        }),
      ]);

    const deliveryRate = sent > 0 ? this.round((delivered / sent) * 100) : 0;
    const openRate = delivered > 0 ? this.round((opened / delivered) * 100) : 0;
    const clickRate = opened > 0 ? this.round((clicked / opened) * 100) : 0;

    const alerts: string[] = [];
    if (bounceRate.status === 'critical') {
      alerts.push('Bounce rate critique');
    }
    if (complaintRate.status === 'critical') {
      alerts.push('Complaint rate critique');
    }

    return {
      bounceRate,
      complaintRate,
      deliveryRate,
      openRate,
      clickRate,
      period: days,
      alerts,
    };
  }

  async checkAndCreateAlerts(tenantId: string): Promise<void> {
    const [bounceRate, complaintRate] = await Promise.all([
      this.getBounceRate(tenantId, 7),
      this.getComplaintRate(tenantId, 7),
    ]);

    if (bounceRate.rate > 5) {
      await this.createInsightIfMissing(
        tenantId,
        'Taux de bounce critique',
        `${bounceRate.rate}% de bounces sur 7 jours. La r�putation d�envoi est en danger.`,
        {
          bounceRate: bounceRate.rate,
          threshold: 5,
          bounced: bounceRate.bounced,
          sent: bounceRate.sent,
        },
      );
    }

    if (complaintRate.rate > 0.1) {
      await this.createInsightIfMissing(
        tenantId,
        'Taux de plaintes �lev�',
        `${complaintRate.rate}% de plaintes sur 7 jours. La d�livrabilit� devient risqu�e.`,
        {
          complaintRate: complaintRate.rate,
          threshold: 0.1,
          complained: complaintRate.complained,
          sent: complaintRate.sent,
        },
      );
    }
  }

  async autoSuppressBounced(tenantId: string): Promise<{ suppressed: number }> {
    const cutoff = this.getCutoff(30);
    const suppressedContactIds = new Set<string>();

    const legacyContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        emailStatus: EmailStatus.BOUNCED,
        bouncedAt: null,
      },
      select: { id: true },
    });

    for (const contact of legacyContacts) {
      const firstBounce = await this.prisma.emailEvent.findFirst({
        where: {
          tenantId,
          contactId: contact.id,
          type: EmailEventType.BOUNCED,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          emailStatus: EmailStatus.BOUNCED,
          bouncedAt: firstBounce?.createdAt ?? new Date(),
        },
      });

      suppressedContactIds.add(contact.id);
    }

    const bounceEvents = await this.prisma.emailEvent.findMany({
      where: {
        tenantId,
        type: EmailEventType.BOUNCED,
        createdAt: { gte: cutoff },
      },
      select: { contactId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const firstBounceByContact = new Map<string, Date>();
    for (const event of bounceEvents) {
      if (!firstBounceByContact.has(event.contactId)) {
        firstBounceByContact.set(event.contactId, event.createdAt);
      }
    }

    for (const [contactId, firstBounceAt] of firstBounceByContact.entries()) {
      if (suppressedContactIds.has(contactId)) {
        continue;
      }

      const result = await this.prisma.contact.updateMany({
        where: { id: contactId, tenantId },
        data: {
          emailStatus: EmailStatus.BOUNCED,
          bouncedAt: firstBounceAt,
        },
      });

      if (result.count > 0) {
        suppressedContactIds.add(contactId);
      }
    }

    return { suppressed: suppressedContactIds.size };
  }

  async autoSuppressComplained(
    tenantId: string,
  ): Promise<{ suppressed: number }> {
    const cutoff = this.getCutoff(30);
    const suppressedContactIds = new Set<string>();

    const legacyContacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        emailStatus: EmailStatus.COMPLAINED,
        complainedAt: null,
      },
      select: { id: true },
    });

    for (const contact of legacyContacts) {
      const firstComplaint = await this.prisma.emailEvent.findFirst({
        where: {
          tenantId,
          contactId: contact.id,
          type: EmailEventType.COMPLAINED,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          emailStatus: EmailStatus.COMPLAINED,
          complainedAt: firstComplaint?.createdAt ?? new Date(),
        },
      });

      suppressedContactIds.add(contact.id);
    }

    const complaintEvents = await this.prisma.emailEvent.findMany({
      where: {
        tenantId,
        type: EmailEventType.COMPLAINED,
        createdAt: { gte: cutoff },
      },
      select: { contactId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const firstComplaintByContact = new Map<string, Date>();
    for (const event of complaintEvents) {
      if (!firstComplaintByContact.has(event.contactId)) {
        firstComplaintByContact.set(event.contactId, event.createdAt);
      }
    }

    for (const [
      contactId,
      firstComplaintAt,
    ] of firstComplaintByContact.entries()) {
      if (suppressedContactIds.has(contactId)) {
        continue;
      }

      const result = await this.prisma.contact.updateMany({
        where: { id: contactId, tenantId },
        data: {
          emailStatus: EmailStatus.COMPLAINED,
          complainedAt: firstComplaintAt,
        },
      });

      if (result.count > 0) {
        suppressedContactIds.add(contactId);
      }
    }

    return { suppressed: suppressedContactIds.size };
  }
}
