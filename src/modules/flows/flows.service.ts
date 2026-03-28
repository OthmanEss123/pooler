import {
  BadRequestException,
  Injectable,
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

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class FlowsService {
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

  async create(tenantId: string, dto: CreateFlowDto) {
    this.validateTrigger(dto.trigger);
    this.validateNodes(dto.nodes);

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

    const execution = await this.prisma.flowExecution.create({
      data: {
        tenantId,
        flowId,
        contactId,
        status: FlowExecutionStatus.RUNNING,
        currentStepIndex: 0,
      },
    });

    await this.flowQueueService.triggerExecution(execution.id);

    return {
      executionId: execution.id,
    };
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
}
