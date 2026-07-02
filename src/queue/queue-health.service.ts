import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export interface QueueCounters {
  waiting: number;
  active: number;
  failed: number;
}

export interface QueueHealthStats {
  sync: QueueCounters;
}

function isEnabled(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() !== 'false';
  }

  return defaultValue;
}

@Injectable()
export class QueueHealthService implements OnModuleDestroy {
  private readonly queueEnabled: boolean;
  private readonly syncQueue?: Queue;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.queueEnabled = isEnabled(
      this.configService.get('QUEUE_ENABLED'),
      true,
    );

    if (!this.queueEnabled) {
      return;
    }

    const connection = this.redisService.getConnectionOptions();
    this.syncQueue = new Queue('sync', { connection });
  }

  async getStats(): Promise<QueueHealthStats> {
    if (!this.queueEnabled || !this.syncQueue) {
      return {
        sync: { waiting: 0, active: 0, failed: 0 },
      };
    }

    const [waiting, active, failed] = await Promise.all([
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getActiveCount(),
      this.syncQueue.getFailedCount(),
    ]);

    return {
      sync: { waiting, active, failed },
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.syncQueue) {
      await this.syncQueue.close();
    }
  }
}
