import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FlowExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowQueueService } from '../../queue/services/flow-queue.service';
import { FlowExecutor } from './flow-executor';

const STUCK_STARTED_HOURS = 1;
const STALE_HEARTBEAT_MINUTES = 15;
const MAX_EXECUTION_HOURS = 24;

@Injectable()
export class FlowRecoveryService {
  private readonly logger = new Logger(FlowRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowQueueService: FlowQueueService,
    private readonly flowExecutor: FlowExecutor,
  ) {}

  @Cron('*/15 * * * *')
  async handleRecoveryCron() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    await this.recoverStuckExecutions();
  }

  async recoverStuckExecutions() {
    const hardTimeoutCutoff = this.hoursAgo(MAX_EXECUTION_HOURS);
    const stuckStartedCutoff = this.hoursAgo(STUCK_STARTED_HOURS);
    const staleHeartbeatCutoff = this.minutesAgo(STALE_HEARTBEAT_MINUTES);

    const hardTimedOutExecutions = await this.prisma.flowExecution.findMany({
      where: {
        status: FlowExecutionStatus.RUNNING,
        startedAt: {
          lt: hardTimeoutCutoff,
        },
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    let failed = 0;
    let recovered = 0;

    for (const execution of hardTimedOutExecutions) {
      if (await this.failExecution(execution.id, 'Execution timeout')) {
        failed += 1;
      }
    }

    const stuckExecutions = await this.prisma.flowExecution.findMany({
      where: {
        status: FlowExecutionStatus.RUNNING,
        startedAt: {
          gte: hardTimeoutCutoff,
          lt: stuckStartedCutoff,
        },
        OR: [
          { lastHeartbeat: null },
          {
            lastHeartbeat: {
              lt: staleHeartbeatCutoff,
            },
          },
        ],
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    for (const execution of stuckExecutions) {
      try {
        if (execution.currentStepIndex > 0) {
          await this.resumeExecution(execution.id, execution.currentStepIndex);
          recovered += 1;
          continue;
        }

        if (await this.failExecution(execution.id, 'Execution timeout')) {
          failed += 1;
        }
      } catch (error) {
        this.logger.error(
          `Erreur recovery execution ${execution.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return {
      scanned: hardTimedOutExecutions.length + stuckExecutions.length,
      recovered,
      failed,
    };
  }

  async heartbeat(executionId: string, at = new Date()) {
    return this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        lastHeartbeat: at,
      },
    });
  }

  private async resumeExecution(executionId: string, currentStepIndex: number) {
    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        currentStepIndex,
        lastHeartbeat: new Date(),
        error: null,
      },
    });

    if (this.flowQueueService.canEnqueue()) {
      await this.flowQueueService.resumeExecution(
        executionId,
        currentStepIndex,
        0,
      );
      return;
    }

    await this.flowExecutor.execute(executionId);
  }

  private async failExecution(executionId: string, message: string) {
    const execution = await this.prisma.flowExecution.findFirst({
      where: {
        id: executionId,
        status: FlowExecutionStatus.RUNNING,
      },
    });

    if (!execution) {
      return false;
    }

    await this.prisma.flowExecution.update({
      where: { id: executionId },
      data: {
        status: FlowExecutionStatus.FAILED,
        failedAt: new Date(),
        error: message,
        lastHeartbeat: new Date(),
      },
    });

    return true;
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  private minutesAgo(minutes: number) {
    return new Date(Date.now() - minutes * 60 * 1000);
  }
}
