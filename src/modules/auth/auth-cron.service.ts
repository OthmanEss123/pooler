import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AuthCronService {
  private readonly logger = new Logger(AuthCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *')
  async cleanupExpiredTokens() {
    const now = new Date();

    const [deletedRefreshTokens, deletedApiKeys] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      }),
      this.prisma.apiKey.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      }),
    ]);

    this.logger.log(
      JSON.stringify({
        action: 'CLEANUP_EXPIRED_TOKENS',
        deletedRefreshTokens: deletedRefreshTokens.count,
        deletedApiKeys: deletedApiKeys.count,
        at: now.toISOString(),
      }),
    );
  }
}
