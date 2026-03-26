import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickhouseService,
    private readonly config: ConfigService,
  ) {}

  async check() {
    const [prismaOk, clickhouseOk] = await Promise.all([
      this.prisma.isHealthy(),
      this.clickhouse.isHealthy(),
    ]);

    const allOk = prismaOk && clickhouseOk;

    return {
      status: allOk ? 'ok' : 'degraded',
      env: this.config.get<string>('app.nodeEnv', 'development'),
      timestamp: new Date().toISOString(),
      services: {
        prisma: prismaOk ? 'connected' : 'error',
        clickhouse: clickhouseOk ? 'connected' : 'error',
      },
    };
  }
}
