import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FlowExecutionStatus, FlowStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowQueueService } from '../../queue/services/flow-queue.service';
import {
  CreateFlowDto,
  FlowNodeType,
  FlowTriggerType,
} from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';

const FLOW_EXECUTION_MAX_DURATION_HOURS = 24;

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowQueueService: FlowQueueService,
  ) {}

  private validateTrigger(trigger: unknown) {
    if (typeof trigger !== 'object' || trigger === null) {
      throw new BadRequestException('Trigger non configure');
    }

    const type = (trigger as Record<string, unknown>).type;

    if (!type) {
      throw new BadRequestException('Trigger non configure');
    }
  }

  private validateNodes(nodes: unknown) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new BadRequestException('Le flow doit contenir des noeuds');
    }

    const hasExit = nodes.some((node) => {
      if (typeof node !== 'object' || node === null) {
        return false;
      }

      return (node as Record<string, unknown>).type === FlowNodeType.EXIT;
    });

    if (!hasExit) {
      throw new BadRequestException(
        'Le flow doit contenir au moins un noeud exit',
      );
    }
  }

  private validateFlowGraph(nodes: unknown) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new BadRequestException('Un flow doit avoir au moins un noeud');
    }

    const nodeMap = new Map<string, Record<string, unknown>>();

    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) {
        throw new BadRequestException(
          'Chaque noeud du flow doit etre un objet',
        );
      }

      const record = node as Record<string, unknown>;
      const nodeId = record.id;

      if (typeof nodeId !== 'string' || nodeId.length === 0) {
        throw new BadRequestException('Chaque noeud doit avoir un id valide');
      }

      if (nodeMap.has(nodeId)) {
        throw new BadRequestException(`Noeud duplique detecte: ${nodeId}`);
      }

      nodeMap.set(nodeId, record);
    }

    const hasExit = [...nodeMap.values()].some(
      (node) => node.type === FlowNodeType.EXIT,
    );

    if (!hasExit) {
      throw new BadRequestException(
        'Un flow doit avoir au moins un noeud de type exit',
      );
    }

    const visited = new Set<string>();

    const dfs = (nodeId: string, path: Set<string>) => {
      if (!nodeId) {
        return;
      }

      if (path.has(nodeId)) {
        throw new BadRequestException(
          `Boucle infinie detectee au noeud: ${nodeId}`,
        );
      }

      if (visited.has(nodeId)) {
        return;
      }

      const node = nodeMap.get(nodeId);

      if (!node) {
        throw new BadRequestException(`Noeud cible introuvable: ${nodeId}`);
      }

      path.add(nodeId);
      visited.add(nodeId);

      const nexts = [node.nextId, node.trueNextId, node.falseNextId].filter(
        (next): next is string => typeof next === 'string' && next.length > 0,
      );

      for (const next of nexts) {
        dfs(next, new Set(path));
      }
    };

    for (const nodeId of nodeMap.keys()) {
      dfs(nodeId, new Set());
    }
  }

  async create(tenantId: string, dto: CreateFlowDto) {
    this.validateTrigger(dto.trigger);
    this.validateNodes(dto.nodes);
    this.validateFlowGraph(dto.nodes);

    return this.prisma.flow.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        trigger: toInputJsonValue(dto.trigger),
        nodes: toInputJsonValue(dto.nodes),
        status: FlowStatus.DRAFT,
      },
    });
  }

  async findAll(tenantId: string) {
    const flows = await this.prisma.flow.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const runningCounts = await this.prisma.flowExecution.groupBy({
      by: ['flowId'],
      where: {
        tenantId,
        status: FlowExecutionStatus.RUNNING,
      },
      _count: {
        _all: true,
      },
    });

    const countMap = new Map(
      runningCounts.map((item) => [item.flowId, item._count._all]),
    );

    return flows.map((flow) => ({
      ...flow,
      _count: {
        runningExecutions: countMap.get(flow.id) ?? 0,
      },
    }));
  }

  async findOne(tenantId: string, id: string) {
    const flow = await this.prisma.flow.findFirst({
      where: { id, tenantId },
    });

    if (!flow) {
      throw new NotFoundException('Flow introuvable');
    }

    return flow;
  }

  async update(tenantId: string, id: string, dto: UpdateFlowDto) {
    const flow = await this.findOne(tenantId, id);

    if (flow.status === FlowStatus.ACTIVE) {
      throw new BadRequestException('Impossible de modifier un flow ACTIVE');
    }

    if (dto.trigger !== undefined) {
      this.validateTrigger(dto.trigger);
    }

    if (dto.nodes !== undefined) {
      this.validateNodes(dto.nodes);
      this.validateFlowGraph(dto.nodes);
    }

    return this.prisma.flow.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.trigger !== undefined
          ? { trigger: toInputJsonValue(dto.trigger) }
          : {}),
        ...(dto.nodes !== undefined
          ? { nodes: toInputJsonValue(dto.nodes) }
          : {}),
      },
    });
  }

  async activate(tenantId: string, id: string) {
    const flow = await this.findOne(tenantId, id);
    this.validateTrigger(flow.trigger);
    this.validateNodes(flow.nodes);
    this.validateFlowGraph(flow.nodes);

    return this.prisma.flow.update({
      where: { id },
      data: { status: FlowStatus.ACTIVE },
    });
  }

  async pause(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.flow.update({
      where: { id },
      data: { status: FlowStatus.PAUSED },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const flow = await this.findOne(tenantId, id);

    if (flow.status === FlowStatus.ACTIVE) {
      throw new BadRequestException('Impossible de supprimer un flow ACTIVE');
    }

    const runningExecution = await this.prisma.flowExecution.findFirst({
      where: {
        tenantId,
        flowId: id,
        status: FlowExecutionStatus.RUNNING,
      },
    });

    if (runningExecution) {
      throw new BadRequestException(
        'Impossible de supprimer un flow avec des executions RUNNING',
      );
    }

    await this.prisma.flow.delete({
      where: { id },
    });
  }

  async triggerFlow(tenantId: string, flowId: string, contactId: string) {
    const flow = await this.findOne(tenantId, flowId);

    if (flow.status !== FlowStatus.ACTIVE) {
      throw new BadRequestException('Le flow doit etre ACTIVE');
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });

    if (!contact) {
      throw new NotFoundException('Contact introuvable');
    }

    const now = new Date();
    const triggerRef = this.buildTriggerRef(flowId, contactId, now);

    const existingExecution = await this.prisma.flowExecution.findFirst({
      where: {
        tenantId,
        flowId,
        contactId,
        triggerRef,
      },
    });

    if (existingExecution) {
      return {
        executionId: existingExecution.id,
        duplicated: true,
      };
    }

    try {
      const execution = await this.prisma.flowExecution.create({
        data: {
          tenantId,
          flowId,
          contactId,
          triggerRef,
          status: FlowExecutionStatus.RUNNING,
          currentStepIndex: 0,
          timeoutAt: this.resolveTimeoutAt(now),
          lastHeartbeat: now,
        },
      });

      await this.flowQueueService.triggerExecution(execution.id);

      return {
        executionId: execution.id,
        duplicated: false,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicateExecution = await this.prisma.flowExecution.findFirst({
          where: {
            tenantId,
            flowId,
            contactId,
            triggerRef,
          },
        });

        if (duplicateExecution) {
          return {
            executionId: duplicateExecution.id,
            duplicated: true,
          };
        }
      }

      throw error;
    }
  }

  async findExecutions(tenantId: string, flowId: string) {
    await this.findOne(tenantId, flowId);

    return this.prisma.flowExecution.findMany({
      where: {
        tenantId,
        flowId,
      },
      include: {
        steps: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async triggerFlowsSafe(
    tenantId: string,
    triggerType: FlowTriggerType | string,
    contactId: string,
  ): Promise<void> {
    try {
      if (typeof this.prisma.flow?.findMany !== 'function') {
        return;
      }

      const flows = await this.prisma.flow.findMany({
        where: {
          tenantId,
          status: FlowStatus.ACTIVE,
        },
      });

      const matching = flows.filter((flow) => {
        const trigger = flow.trigger as Record<string, unknown> | null;
        return trigger?.type === triggerType;
      });

      const results = await Promise.allSettled(
        matching.map((candidateFlow) =>
          this.triggerFlow(tenantId, candidateFlow.id, contactId),
        ),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const reason =
            result.reason instanceof Error
              ? (result.reason.stack ?? result.reason.message)
              : JSON.stringify(result.reason);

          this.logger.error(
            `Flow ${matching[index].id} trigger ${triggerType} echoue`,
            reason,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `triggerFlowsSafe ${triggerType} - erreur globale`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findActiveFlowsByTrigger(tenantId: string, type: FlowTriggerType) {
    if (typeof this.prisma.flow?.findMany !== 'function') {
      return [];
    }

    return this.prisma.flow.findMany({
      where: {
        tenantId,
        status: FlowStatus.ACTIVE,
        trigger: {
          path: ['type'],
          equals: type,
        },
      },
    });
  }

  private buildTriggerRef(flowId: string, contactId: string, now: Date) {
    const dayRef = now.toISOString().slice(0, 10);
    return createHash('sha256')
      .update(`${flowId}:${contactId}:${dayRef}`)
      .digest('hex');
  }

  private resolveTimeoutAt(startedAt: Date) {
    return new Date(
      startedAt.getTime() + FLOW_EXECUTION_MAX_DURATION_HOURS * 60 * 60 * 1000,
    );
  }
}
