import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

@Injectable()
export class FlowQueueService {
  private readonly logger = new Logger(FlowQueueService.name);
  private readonly queueEnabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectQueue('flow') private readonly flowQueue?: Queue,
  ) {
    this.queueEnabled = this.config.get<boolean>('QUEUE_ENABLED', true);
  }

  async triggerExecution(executionId: string) {
    if (!this.queueEnabled || !this.flowQueue) {
      this.logger.log(
        `[QUEUE_DISABLED] triggerExecution ignored: ${executionId}`,
      );
      return;
    }

    await this.flowQueue.add(
      'execute-flow',
      { executionId },
      {
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  async resumeExecution(
    executionId: string,
    nextStepIndex: number,
    delayMs: number,
  ) {
    if (!this.queueEnabled || !this.flowQueue) {
      this.logger.log(
        `[QUEUE_DISABLED] resumeExecution ignored: ${executionId} -> ${nextStepIndex}`,
      );
      return;
    }

    await this.flowQueue.add(
      'resume-flow',
      { executionId, nextStepIndex },
      {
        delay: delayMs,
        attempts: 3,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }
}
