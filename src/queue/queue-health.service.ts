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
  campaign: QueueCounters;
  email: QueueCounters;
}

@Injectable()
export class QueueHealthService implements OnModuleDestroy {
  private readonly queueEnabled: boolean;
  private readonly campaignQueue?: Queue;
  private readonly emailQueue?: Queue;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.queueEnabled = this.configService.get<boolean>('QUEUE_ENABLED', true);

    if (!this.queueEnabled) {
      return;
    }

    const connection = this.redisService.getConnectionOptions();
    this.campaignQueue = new Queue('campaign', { connection });
    this.emailQueue = new Queue('email', { connection });
  }

  async getStats(): Promise<QueueHealthStats> {
    if (!this.queueEnabled || !this.campaignQueue || !this.emailQueue) {
      return {
        campaign: { waiting: 0, active: 0, failed: 0 },
        email: { waiting: 0, active: 0, failed: 0 },
      };
    }

    const [
      campaignWaiting,
      campaignActive,
      campaignFailed,
      emailWaiting,
      emailActive,
      emailFailed,
    ] = await Promise.all([
      this.campaignQueue.getWaitingCount(),
      this.campaignQueue.getActiveCount(),
      this.campaignQueue.getFailedCount(),
      this.emailQueue.getWaitingCount(),
      this.emailQueue.getActiveCount(),
      this.emailQueue.getFailedCount(),
    ]);

    return {
      campaign: {
        waiting: campaignWaiting,
        active: campaignActive,
        failed: campaignFailed,
      },
      email: {
        waiting: emailWaiting,
        active: emailActive,
        failed: emailFailed,
      },
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.campaignQueue) {
      await this.campaignQueue.close();
    }

    if (this.emailQueue) {
      await this.emailQueue.close();
    }
  }
}
