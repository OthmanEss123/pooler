import { Injectable } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    name: string,
    scope: ApiKeyScope = ApiKeyScope.FULL_ACCESS,
    expiresAt?: Date,
  ) {
    const rawKey = `pk_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.slice(0, 10);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.create({
      data: {
        tenantId,
        name,
        keyHash,
        prefix,
        scope,
        expiresAt,
      },
    });

    return {
      id: apiKey.id,
      key: rawKey,
      prefix: apiKey.prefix,
      scope: apiKey.scope,
      createdAt: apiKey.createdAt,
    };
  }

  async validate(rawKey: string) {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey || apiKey.revokedAt) {
      return null;
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return null;
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return apiKey;
  }

  async cleanupExpired() {
    const result = await this.prisma.apiKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return result.count;
  }
}
