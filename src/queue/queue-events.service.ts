import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueEvents } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueEventsService.name);
  private readonly queueEnabled: boolean;
  private readonly campaignQueueEvents?: QueueEvents;
  private readonly emailQueueEvents?: QueueEvents;
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
    this.campaignQueueEvents = new QueueEvents('campaign', { connection });
    this.emailQueueEvents = new QueueEvents('email', { connection });

    this.bindEvents(this.campaignQueueEvents, 'campaign');
    this.bindEvents(this.emailQueueEvents, 'email');

    this.resetTimer = setInterval(
      () => {
        this.failedCountInCurrentHour = 0;
      },
      60 * 60 * 1000,
    );
    this.resetTimer.unref?.();
  }

  private bindEvents(queueEvents: QueueEvents, queueName: string): void {
    queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.failedCountInCurrentHour += 1;

      this.logger.error(
        JSON.stringify({
          queue: queueName,
          event: 'failed',
          jobId,
          failedReason,
          failedCountInCurrentHour: this.failedCountInCurrentHour,
        }),
      );

      if (this.failedCountInCurrentHour > 10) {
        this.logger.error(
          JSON.stringify({
            alert: 'TOO_MANY_FAILED_JOBS',
            queue: queueName,
            threshold: 10,
            current: this.failedCountInCurrentHour,
          }),
        );
      }
    });

    queueEvents.on('stalled', ({ jobId }) => {
      this.logger.warn(
        JSON.stringify({
          queue: queueName,
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

    if (this.campaignQueueEvents) {
      await this.campaignQueueEvents.close();
    }

    if (this.emailQueueEvents) {
      await this.emailQueueEvents.close();
    }
  }
}
