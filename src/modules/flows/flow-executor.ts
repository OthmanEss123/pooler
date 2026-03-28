import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FlowExecutionStatus, Prisma, StepStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowQueueService } from '../../queue/services/flow-queue.service';
import { FlowNodeType } from './dto/create-flow.dto';

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;

type ExecutionResult = {
  nextStepIndex?: number;
  delayMs?: number;
  scheduleResume?: boolean;
  executionDone?: boolean;
  stepStatus?: StepStatus;
  result?: Record<string, unknown>;
};

@Injectable()
export class FlowExecutor {
  private readonly logger = new Logger(FlowExecutor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowQueueService: FlowQueueService,
  ) {}

  async execute(executionId: string) {
    const execution = await this.prisma.flowExecution.findUnique({
      where: { id: executionId },
      include: {
        flow: true,
        contact: true,
      },
    });

    if (!execution) {
      throw new NotFoundException('Execution introuvable');
    }

    if (execution.status !== FlowExecutionStatus.RUNNING) {
      return;
    }

    const nodes = execution.flow.nodes as Array<Record<string, unknown>>;
    const currentIndex = execution.currentStepIndex;
    const node = nodes[currentIndex];

    if (!node) {
      await this.prisma.flowExecution.update({
        where: { id: executionId },
        data: {
          status: FlowExecutionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      return;
    }

    const step = await this.prisma.flowExecutionStep.create({
      data: {
        executionId: execution.id,
        stepId: String(node.id),
        type: String(node.type),
        status: StepStatus.RUNNING,
        executedAt: new Date(),
      },
    });

    try {
      const result = await this.executeNode(node, execution.contact, execution);

      await this.prisma.flowExecutionStep.update({
        where: { id: step.id },
        data: {
          status: result.stepStatus ?? StepStatus.COMPLETED,
          result: toInputJsonValue(result.result ?? null),
        },
      });

      if (result.executionDone) {
        return;
      }

      if (result.scheduleResume) {
        if (
          result.nextStepIndex === undefined ||
          result.delayMs === undefined
        ) {
          throw new Error('Resume data manquante');
        }

        await this.flowQueueService.resumeExecution(
          execution.id,
          result.nextStepIndex,
          result.delayMs,
        );
        return;
      }

      if (result.nextStepIndex === undefined) {
        throw new Error('nextStepIndex manquant');
      }

      await this.prisma.flowExecution.update({
        where: { id: execution.id },
        data: {
          currentStepIndex: result.nextStepIndex,
        },
      });

      await this.flowQueueService.triggerExecution(execution.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      await this.prisma.flowExecutionStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.FAILED,
          result: toInputJsonValue({ message }),
        },
      });

      await this.prisma.flowExecution.update({
        where: { id: execution.id },
        data: {
          status: FlowExecutionStatus.FAILED,
          failedAt: new Date(),
          error: message,
        },
      });

      throw error;
    }
  }

  private async executeNode(
    node: Record<string, unknown>,
    contact: Record<string, unknown>,
    execution: {
      id: string;
      flow: { nodes: unknown };
    },
  ): Promise<ExecutionResult> {
    switch (node.type) {
      case FlowNodeType.SEND_EMAIL:
        return this.handleSendEmail(node, contact, execution);
      case FlowNodeType.WAIT:
        return this.handleWait(node, execution);
      case FlowNodeType.CONDITION:
        return this.handleCondition(node, contact, execution);
      case FlowNodeType.UPDATE_CONTACT:
        return this.handleUpdateContact(node, contact, execution);
      case FlowNodeType.EXIT:
        return this.handleExit(execution);
      default:
        throw new Error(`Type de noeud non supporte: ${String(node.type)}`);
    }
  }

  private getNextIndexByNodeId(
    nodes: Array<Record<string, unknown>>,
    nodeId?: string,
  ) {
    if (!nodeId) {
      return -1;
    }

    return nodes.findIndex((node) => node.id === nodeId);
  }

  private handleSendEmail(
    node: Record<string, unknown>,
    contact: Record<string, unknown>,
    execution: { flow: { nodes: unknown } },
  ): ExecutionResult {
    const nodes = execution.flow.nodes as Array<Record<string, unknown>>;
    const config =
      typeof node.config === 'object' && node.config !== null
        ? (node.config as Record<string, unknown>)
        : {};

    const subject =
      typeof config.subject === 'string' ? config.subject : 'Email';
    const body = typeof config.body === 'string' ? config.body : 'Bonjour';
    const contactEmail =
      typeof contact.email === 'string' ? contact.email : 'unknown@example.com';

    this.logger.log(`Send email to ${contactEmail} | subject=${subject}`);

    const nextStepIndex = this.getNextIndexByNodeId(
      nodes,
      typeof node.nextId === 'string' ? node.nextId : undefined,
    );

    if (nextStepIndex === -1) {
      throw new Error('nextId introuvable pour send_email');
    }

    return {
      nextStepIndex,
      result: {
        sent: true,
        to: contactEmail,
        subject,
        body,
      },
    };
  }

  private async handleWait(
    node: Record<string, unknown>,
    execution: { id: string; flow: { nodes: unknown } },
  ): Promise<ExecutionResult> {
    const nodes = execution.flow.nodes as Array<Record<string, unknown>>;
    const config =
      typeof node.config === 'object' && node.config !== null
        ? (node.config as Record<string, unknown>)
        : {};
    const delayHours = Number(config.delayHours ?? 0);

    if (!delayHours || delayHours < 0) {
      throw new Error('delayHours invalide');
    }

    const nextStepIndex = this.getNextIndexByNodeId(
      nodes,
      typeof node.nextId === 'string' ? node.nextId : undefined,
    );

    if (nextStepIndex === -1) {
      throw new Error('nextId introuvable pour wait');
    }

    await this.prisma.flowExecution.update({
      where: { id: execution.id },
      data: {
        currentStepIndex: nextStepIndex,
      },
    });

    return {
      scheduleResume: true,
      nextStepIndex,
      delayMs: delayHours * 60 * 60 * 1000,
      result: {
        delayHours,
      },
    };
  }

  private handleCondition(
    node: Record<string, unknown>,
    contact: Record<string, unknown>,
    execution: { flow: { nodes: unknown } },
  ): ExecutionResult {
    const nodes = execution.flow.nodes as Array<Record<string, unknown>>;
    const config =
      typeof node.config === 'object' && node.config !== null
        ? (node.config as Record<string, unknown>)
        : {};

    const field = typeof config.field === 'string' ? config.field : '';
    const op = typeof config.op === 'string' ? config.op : '';
    const value = config.value;
    const contactValue = field ? contact[field] : undefined;

    let conditionResult = false;

    switch (op) {
      case 'eq':
        conditionResult = contactValue === value;
        break;
      case 'neq':
        conditionResult = contactValue !== value;
        break;
      case 'gt':
        conditionResult = Number(contactValue) > Number(value);
        break;
      case 'gte':
        conditionResult = Number(contactValue) >= Number(value);
        break;
      case 'lt':
        conditionResult = Number(contactValue) < Number(value);
        break;
      case 'lte':
        conditionResult = Number(contactValue) <= Number(value);
        break;
      case 'contains': {
        const contactText =
          typeof contactValue === 'string' ? contactValue : undefined;
        const compareText = typeof value === 'string' ? value : undefined;
        conditionResult =
          contactText !== undefined &&
          compareText !== undefined &&
          contactText.includes(compareText);
        break;
      }
      default:
        throw new Error(`Operateur condition non supporte: ${op}`);
    }

    const targetNodeId = conditionResult
      ? typeof node.trueNextId === 'string'
        ? node.trueNextId
        : undefined
      : typeof node.falseNextId === 'string'
        ? node.falseNextId
        : undefined;
    const nextStepIndex = this.getNextIndexByNodeId(nodes, targetNodeId);

    if (nextStepIndex === -1) {
      throw new Error('Branche condition introuvable');
    }

    return {
      nextStepIndex,
      result: {
        field,
        op,
        value,
        contactValue,
        matched: conditionResult,
      },
    };
  }

  private async handleUpdateContact(
    node: Record<string, unknown>,
    contact: Record<string, unknown>,
    execution: { flow: { nodes: unknown } },
  ): Promise<ExecutionResult> {
    const nodes = execution.flow.nodes as Array<Record<string, unknown>>;
    const config =
      typeof node.config === 'object' && node.config !== null
        ? (node.config as Record<string, unknown>)
        : {};
    const updates =
      typeof config.updates === 'object' && config.updates !== null
        ? (config.updates as Record<string, unknown>)
        : {};

    await this.prisma.contact.update({
      where: { id: String(contact.id) },
      data: updates,
    });

    const nextStepIndex = this.getNextIndexByNodeId(
      nodes,
      typeof node.nextId === 'string' ? node.nextId : undefined,
    );

    if (nextStepIndex === -1) {
      throw new Error('nextId introuvable pour update_contact');
    }

    return {
      nextStepIndex,
      result: {
        updated: true,
        updates,
      },
    };
  }

  private async handleExit(execution: {
    id: string;
  }): Promise<ExecutionResult> {
    await this.prisma.flowExecution.update({
      where: { id: execution.id },
      data: {
        status: FlowExecutionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    return {
      executionDone: true,
      stepStatus: StepStatus.COMPLETED,
      result: {
        finished: true,
      },
    };
  }
}
