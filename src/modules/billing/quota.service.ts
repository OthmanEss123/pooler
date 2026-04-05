import { ForbiddenException, Injectable } from '@nestjs/common';
import { BillingPlan } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingService } from './billing.service';

@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async checkContactLimit(tenantId: string) {
    const usage = await this.billingService.getUsage(tenantId);

    if (usage.contacts.used >= usage.contacts.limit) {
      throw new ForbiddenException(
        `Limite de contacts atteinte pour le plan ${usage.plan}`,
      );
    }
  }

  async checkEmailQuota(tenantId: string, plannedEmails = 1) {
    const usage = await this.billingService.getUsage(tenantId);

    if (usage.emailQuota.used + plannedEmails > usage.emailQuota.limit) {
      throw new ForbiddenException(
        `Quota email depasse pour le plan ${usage.plan}`,
      );
    }
  }

  async getPlan(tenantId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });

    return subscription?.plan ?? BillingPlan.STARTER;
  }
}
