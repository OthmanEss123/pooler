import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private readonly queueEnabled: boolean;
  private readonly syncQueueEvents?: QueueEvents;
  private failedCountInCurrentHour = 0;
  private readonly resetTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.queueEnabled = this.configService.get<boolean>('QUEUE_ENABLED', true);

    if (!this.queueEnabled) {
      return;
    }

    const connection = this.redisService.getConnectionOptions();
    this.syncQueueEvents = new QueueEvents('sync', { connection });
    this.bindEvents(this.syncQueueEvents);

    this.resetTimer = setInterval(
      () => {
        this.failedCountInCurrentHour = 0;
      },
      60 * 60 * 1000,
    );
    this.resetTimer.unref?.();
  }

  private bindEvents(queueEvents: QueueEvents): void {
    queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.failedCountInCurrentHour += 1;

      this.logger.error(
        JSON.stringify({
          queue: 'sync',
          event: 'failed',
          jobId,
          failedReason,
          failedCountInCurrentHour: this.failedCountInCurrentHour,
        }),
      );
    });

    queueEvents.on('stalled', ({ jobId }) => {
      this.logger.warn(
        JSON.stringify({
          queue: 'sync',
          event: 'stalled',
          jobId,
        }),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
    }

    if (this.syncQueueEvents) {
      await this.syncQueueEvents.close();
    }
  }
}
