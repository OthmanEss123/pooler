import { Injectable, Logger } from '@nestjs/common';
import { SuppressionReason } from '@prisma/client';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class SuppressionListService {
  private readonly logger = new Logger(SuppressionListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async add(tenantId: string, email: string, reason: SuppressionReason) {
    const normalizedEmail = email.trim().toLowerCase();

    await this.prisma.globalSuppression.upsert({
      where: {
        tenantId_email: { tenantId, email: normalizedEmail },
      },
      update: { reason },
      create: { tenantId, email: normalizedEmail, reason },
    });

    const contact = await this.prisma.contact.findFirst({
      where: { tenantId, email: normalizedEmail },
    });

    if (contact) {
      const statusMap: Partial<
        Record<SuppressionReason, 'UNSUBSCRIBED' | 'BOUNCED' | 'COMPLAINED'>
      > = {
        UNSUBSCRIBED: 'UNSUBSCRIBED',
        BOUNCED: 'BOUNCED',
        COMPLAINED: 'COMPLAINED',
      };

      const newStatus = statusMap[reason];
      const now = new Date();
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: {
          ...(newStatus ? { emailStatus: newStatus } : {}),
          ...(reason === SuppressionReason.UNSUBSCRIBED
            ? { subscribed: false, unsubscribedAt: now }
            : {}),
          ...(reason === SuppressionReason.BOUNCED ? { bouncedAt: now } : {}),
          ...(reason === SuppressionReason.COMPLAINED
            ? { complainedAt: now }
            : {}),
        },
      });
    }

    this.logger.log(
      `Suppression added: ${normalizedEmail} (${reason}) for tenant ${tenantId}`,
    );

    return { suppressed: true, email: normalizedEmail, reason };
  }

  async isSuppressed(tenantId: string, email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();

    const suppression = await this.prisma.globalSuppression.findUnique({
      where: {
        tenantId_email: { tenantId, email: normalizedEmail },
      },
    });

    return suppression !== null;
  }

  async getList(tenantId: string, limit = 50, offset = 0) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.globalSuppression.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.globalSuppression.count({
        where: { tenantId },
      }),
    ]);

    return { data, total, limit, offset };
  }

  async remove(
    tenantId: string,
    email: string,
    actor?: { userId?: string | null; role?: string | null },
  ) {
    const normalizedEmail = email.trim().toLowerCase();

    await this.prisma.globalSuppression.delete({
      where: {
        tenantId_email: { tenantId, email: normalizedEmail },
      },
    });

    this.auditService.log({
      tenantId,
      userId: actor?.userId ?? null,
      action: 'SUPPRESSION_REMOVED',
      entity: 'GLOBAL_SUPPRESSION',
      entityId: normalizedEmail,
      metadata: {
        email: normalizedEmail,
        actorRole: actor?.role ?? null,
      },
    });

    this.logger.log(
      `Suppression removed: ${normalizedEmail} for tenant ${tenantId}`,
    );
  }
}
