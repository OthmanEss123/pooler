import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowExecutor } from '../../modules/flows/flow-executor';

@Processor('flow')
export class FlowProcessor extends WorkerHost {
  constructor(
    private readonly flowExecutor: FlowExecutor,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<Record<string, unknown>, unknown, string>) {
    switch (job.name) {
      case 'execute-flow':
        return this.flowExecutor.execute(String(job.data.executionId));
      case 'resume-flow': {
        const executionId = String(job.data.executionId);
        const nextStepIndex = Number(job.data.nextStepIndex);

        await this.prisma.flowExecution.update({
          where: { id: executionId },
          data: { currentStepIndex: nextStepIndex },
        });

        return this.flowExecutor.execute(executionId);
      }
      default:
        return;
    }
  }
}
