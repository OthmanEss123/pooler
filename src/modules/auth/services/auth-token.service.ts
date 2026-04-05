import { ForbiddenException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async generateTokens(
    userId: string,
    tenantId: string,
    email: string,
    role: string,
    existingFamily?: string,
  ) {
    const payload = { sub: userId, tenantId, email, role };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as StringValue,
    });

    const refreshToken = randomBytes(64).toString('hex');
    const tokenFamily = existingFamily ?? randomUUID();
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenFamily,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, tokenFamily };
  }

  async rotateRefreshToken(tokenFamily: string, rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenFamily },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored) {
        await this.revokeFamily(stored.tokenFamily);
      }

      throw new ForbiddenException('Invalid refresh token');
    }

    const expected = Buffer.from(stored.tokenHash, 'hex');
    const received = Buffer.from(tokenHash, 'hex');

    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      await this.revokeFamily(stored.tokenFamily);
      throw new ForbiddenException('Refresh token reuse detected');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(
      stored.user.id,
      stored.user.tenantId,
      stored.user.email,
      stored.user.role,
      tokenFamily,
    );
  }

  async revokeFamily(tokenFamily: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenFamily },
      data: { revokedAt: new Date() },
    });
  }

  async cleanupExpired() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
      },
    });

    return result.count;
  }
}
