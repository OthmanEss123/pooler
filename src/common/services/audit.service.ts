import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';

const toInputJsonValue = (
  value: Record<string, unknown>,
): Prisma.InputJsonValue => {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  log(dto: CreateAuditLogDto): void {
    if (!dto.tenantId) {
      return;
    }

    const auditDelegate = (
      this.prisma as PrismaService & {
        auditLog?: { create?: (args: unknown) => Promise<unknown> };
      }
    ).auditLog;

    if (!auditDelegate?.create) {
      return;
    }

    void auditDelegate
      .create({
        data: {
          tenantId: dto.tenantId,
          userId: dto.userId ?? null,
          action: dto.action,
          entity: dto.entity,
          entityId: dto.entityId ?? null,
          metadata: toInputJsonValue(dto.metadata),
          ipAddress: dto.ipAddress ?? null,
          userAgent: dto.userAgent ?? null,
        },
      })
      .catch((error: unknown) => {
        this.logger.error(
          'Failed to write audit log',
          error instanceof Error ? error.stack : String(error),
        );
      });
  }
}
