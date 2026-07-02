import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { QuerySegmentsDto } from './dto/query-segments.dto';

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSegmentDto) {
    const exists = await this.prisma.segment.findFirst({
      where: { tenantId, name: dto.name },
    });

    if (exists) {
      throw new ConflictException(
        `Segment with name "${dto.name}" already exists`,
      );
    }

    return this.prisma.segment.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        conditions: (dto.conditions as Prisma.InputJsonValue) ?? {},
      },
    });
  }

  async findAll(tenantId: string, query: QuerySegmentsDto) {
    const where: Prisma.SegmentWhereInput = { tenantId };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.segment.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.segment.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(tenantId: string, id: string) {
    const segment = await this.prisma.segment.findFirst({
      where: { id, tenantId },
    });

    if (!segment) {
      throw new NotFoundException(`Segment ${id} introuvable`);
    }

    return segment;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.segment.delete({
      where: { id },
    });
  }
}
