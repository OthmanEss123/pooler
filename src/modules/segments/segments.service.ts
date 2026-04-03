import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SegmentType } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { FlowsService } from '../flows/flows.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { SegmentEvaluator } from './engines/segment-evaluator';
import type { SegmentConditionGroup } from './types/segment.types';

const toInputJsonValue = (
  value: SegmentConditionGroup,
): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class SegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: SegmentEvaluator,
    private readonly flowsService: FlowsService,
  ) {}

  async create(tenantId: string, dto: CreateSegmentDto) {
    this.evaluator.validateConditions(dto.conditions);

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

    if (dto.type === SegmentType.STATIC) {
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
}
