import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SegmentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { FlowsService } from '../flows/flows.service';
import { EmbeddingsService } from '../contacts/embeddings.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { SegmentEvaluator } from './engines/segment-evaluator';
import type { SegmentConditionGroup } from './types/segment.types';

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: SegmentEvaluator,
    private readonly flowsService: FlowsService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  async create(tenantId: string, dto: CreateSegmentDto) {
    if (dto.type !== SegmentType.SEMANTIC) {
      this.evaluator.validateConditions(
        dto.conditions as unknown as SegmentConditionGroup,
      );
    }

    const existing = await this.prisma.segment.findFirst({
      where: {
        tenantId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new BadRequestException('A segment with this name already exists.');
    }

    const segment = await this.prisma.segment.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        conditions: toInputJsonValue(dto.conditions),
      },
    });

    if (dto.type === SegmentType.STATIC || dto.type === SegmentType.SEMANTIC) {
      const synced = await this.syncMembers(tenantId, segment.id);

      return {
        ...segment,
        synced,
      };
    }

    return segment;
  }

  async findAll(tenantId: string) {
    return this.prisma.segment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        type: true,
        contactCount: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found.');
    }

    return segment;
  }

  async previewCount(tenantId: string, conditions: SegmentConditionGroup) {
    this.evaluator.validateConditions(conditions);

    const where = this.evaluator.buildWhere(tenantId, conditions);
    const count = await this.prisma.contact.count({ where });

    return { count };
  }

  async syncMembers(tenantId: string, segmentId: string) {
    const segment = await this.findOne(tenantId, segmentId);

    if (segment.type === SegmentType.SEMANTIC) {
      const synced = await this.syncSemanticMembers(
        tenantId,
        segment.id,
        segment.conditions,
      );
      return synced;
    }

    const conditions = segment.conditions as unknown as SegmentConditionGroup;
    this.evaluator.validateConditions(conditions);

    const [newContacts, currentMembers] = await Promise.all([
      this.prisma.contact.findMany({
        where: this.evaluator.buildWhere(tenantId, conditions),
        select: { id: true },
      }),
      this.prisma.segmentMember.findMany({
        where: { segmentId: segment.id },
        select: { contactId: true },
      }),
    ]);

    const newIds = new Set(newContacts.map((contact) => contact.id));
    const currentIds = new Set(
      currentMembers.map((member) => member.contactId),
    );

    const toAdd = [...newIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !newIds.has(id));

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (toRemove.length > 0) {
        await tx.segmentMember.deleteMany({
          where: {
            segmentId: segment.id,
            contactId: { in: toRemove },
          },
        });
      }

      if (toAdd.length > 0) {
        await tx.segmentMember.createMany({
          data: toAdd.map((contactId) => ({
            segmentId: segment.id,
            contactId,
          })),
          skipDuplicates: true,
        });
      }

      await tx.segment.update({
        where: { id: segment.id },
        data: {
          contactCount: newIds.size,
          lastSyncAt: new Date(),
        },
      });
    });

    for (const contactId of toAdd) {
      void this.flowsService.triggerFlowsSafe(
        tenantId,
        FlowTriggerType.SEGMENT_ENTER,
        contactId,
      );
    }

    return {
      segmentId: segment.id,
      synced: newIds.size,
      added: toAdd.length,
      removed: toRemove.length,
    };
  }

  async findMembers(tenantId: string, segmentId: string, page = 1, limit = 20) {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id: segmentId,
        tenantId,
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found.');
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.segmentMember.findMany({
        where: {
          segmentId,
        },
        skip,
        take: safeLimit,
        orderBy: {
          addedAt: 'desc',
        },
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              emailStatus: true,
              totalRevenue: true,
              totalOrders: true,
              firstOrderAt: true,
              lastOrderAt: true,
            },
          },
        },
      }),
      this.prisma.segmentMember.count({
        where: {
          segmentId,
        },
      }),
    ]);

    return {
      data: items.map((item) => item.contact),
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async remove(tenantId: string, segmentId: string): Promise<void> {
    const segment = await this.prisma.segment.findFirst({
      where: {
        id: segmentId,
        tenantId,
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found.');
    }

    await this.prisma.segment.delete({
      where: {
        id: segmentId,
      },
    });
  }

  private async syncSemanticMembers(
    tenantId: string,
    segmentId: string,
    rawConditions: unknown,
  ) {
    const conditions =
      rawConditions && typeof rawConditions === 'object'
        ? (rawConditions as Record<string, unknown>)
        : {};
    const sourceContactId = conditions.sourceContactId;
    const threshold = Number(conditions.similarity ?? 0.8);

    if (!sourceContactId || typeof sourceContactId !== 'string') {
      throw new BadRequestException('sourceContactId manquant');
    }

    const similar = await this.embeddingsService.findSimilarContacts(
      tenantId,
      sourceContactId,
      100,
    );
    const matched = similar.filter((item) => item.similarity >= threshold);
    const currentMembers = await this.prisma.segmentMember.findMany({
      where: { segmentId },
      select: { contactId: true },
    });
    const currentIds = new Set(
      currentMembers.map((member) => member.contactId),
    );
    const matchedIds = new Set(matched.map((item) => item.contact.id));
    const toAdd = [...matchedIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !matchedIds.has(id));

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.segmentMember.deleteMany({
        where: { segmentId },
      });

      if (matched.length > 0) {
        await tx.segmentMember.createMany({
          data: matched.map((item) => ({
            segmentId,
            contactId: item.contact.id,
          })),
          skipDuplicates: true,
        });
      }

      await tx.segment.update({
        where: { id: segmentId },
        data: {
          contactCount: matched.length,
          lastSyncAt: new Date(),
        },
      });
    });

    for (const contactId of toAdd) {
      void this.flowsService.triggerFlowsSafe(
        tenantId,
        FlowTriggerType.SEGMENT_ENTER,
        contactId,
      );
    }

    return {
      segmentId,
      synced: matched.length,
      added: toAdd.length,
      removed: toRemove.length,
    };
  }
}
