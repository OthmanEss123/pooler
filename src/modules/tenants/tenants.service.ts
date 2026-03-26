import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} introuvable`);
    }

    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);

    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
  }

  async getStats(tenantId: string) {
    await this.findById(tenantId);

    const [memberCount, activeApiKeys, activeSessions] = await Promise.all([
      this.prisma.membership.count({
        where: { tenantId },
      }),
      this.prisma.apiKey.count({
        where: { tenantId, revokedAt: null },
      }),
      this.prisma.refreshToken.count({
        where: {
          tenantId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    return {
      memberCount,
      activeApiKeys,
      activeSessions,
    };
  }
}
