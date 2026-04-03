import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QueueHealthService } from '../../queue/queue-health.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clickhouse: ClickhouseService,
    private readonly redisService: RedisService,
    private readonly queueHealthService: QueueHealthService,
    private readonly config: ConfigService,
  ) {}

  async check() {
    const [prismaOk, clickhouseOk, redisOk, queueStats] = await Promise.all([
      this.prisma.isHealthy(),
      this.clickhouse.isHealthy(),
      this.redisService.isHealthy(),
      this.queueHealthService.getStats(),
    ]);

    const allOk = prismaOk && clickhouseOk && redisOk;

    return {
      status: allOk ? 'ok' : 'degraded',
      env:
        this.config.get<string>('app.nodeEnv', 'development') ?? 'development',
      timestamp: new Date().toISOString(),
      services: {
        prisma: prismaOk ? 'connected' : 'error',
        clickhouse: clickhouseOk ? 'connected' : 'error',
        redis: redisOk ? 'connected' : 'error',
      },
      queues: queueStats,
    };
  }
}
