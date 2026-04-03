import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Controller('audit-logs')
@UseGuards(RolesGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('OWNER')
  async findAll(
    @CurrentTenant() tenantId: string,
    @Query() query: QueryAuditLogsDto,
  ) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    });
  }
}
