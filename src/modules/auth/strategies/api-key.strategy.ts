import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';
import type { AuthenticatedUser } from '../../../common/types/auth-request';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async validate(req: Request): Promise<AuthenticatedUser> {
    const raw = req.headers['x-api-key'];

    if (!raw || typeof raw !== 'string') {
      throw new UnauthorizedException();
    }

    const keyHash = createHash('sha256').update(raw).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (!apiKey || apiKey.revokedAt || !apiKey.tenant.isActive) {
      throw new UnauthorizedException('API key invalide');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expiree');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      id: null,
      tenantId: apiKey.tenantId,
      email: null,
      role: 'API_KEY',
      scope: apiKey.scope,
      isActive: true,
      emailVerified: false,
    };
  }
}
