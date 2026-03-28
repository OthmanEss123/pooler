// src/modules/health/health.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClickhouseService } from '../../database/clickhouse/clickhouse.service';
import Redis from 'ioredis';

@Injectable()
export class HealthService {
  private redis: Redis | null = null;

  constructor(
    private readonly prisma:      PrismaService,
    private readonly clickhouse:  ClickhouseService,
    private readonly config:      ConfigService,
  ) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl && process.env.NODE_ENV !== 'test') {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableReadyCheck:     false,
        lazyConnect:          true,
      });
    }
  }

  async check() {
    const [prismaOk, clickhouseOk, redisOk] = await Promise.all([
      this.prisma.isHealthy(),
      this.clickhouse.isHealthy(),
      this.checkRedis(),
    ]);

    const allOk = prismaOk && clickhouseOk && redisOk;

    return {
      status:    allOk ? 'ok' : 'degraded',
      env:       this.config.get('NODE_ENV', 'development'),
      timestamp: new Date().toISOString(),
      services:  {
        prisma:     prismaOk     ? 'connected' : 'error',
        clickhouse: clickhouseOk ? 'connected' : 'error',
        redis:      redisOk      ? 'connected' : 'error',
      },
    };
  }

  private async checkRedis(): Promise<boolean> {
    if (!this.redis) return true; // optionnel en dev/test
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}