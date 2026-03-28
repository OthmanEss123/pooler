import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class FlowQueueService {
  private readonly logger = new Logger(FlowQueueService.name);
  private readonly isTest = process.env.NODE_ENV === 'test';

  constructor(
    @Optional() @InjectQueue('flow') private readonly flowQueue?: Queue,
  ) {}

  async triggerExecution(executionId: string) {
    if (this.isTest || !this.flowQueue) {
      this.logger.log(`[TEST] triggerExecution simule: ${executionId}`);
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
    if (this.isTest || !this.flowQueue) {
      this.logger.log(
        `[TEST] resumeExecution simule: ${executionId} -> ${nextStepIndex}`,
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
