import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BulkUpsertContactsDto } from './dto/bulk-upsert-contacts.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { FlowsService } from '../flows/flows.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowsService: FlowsService,
  ) {}

  async create(tenantId: string, dto: CreateContactDto) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.contact.findFirst({
      where: { tenantId, email },
    });

    if (existing) {
      throw new ConflictException('Contact email already exists');
    }

    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    void this.flowsService.triggerFlowsSafe(
      tenantId,
      FlowTriggerType.CONTACT_CREATED,
      contact.id,
    );

    return contact;
  }

  async bulkUpsert(tenantId: string, dto: BulkUpsertContactsDto) {
    let upserted = 0;
    const errors: { email: string; reason: string }[] = [];

    for (const contact of dto.contacts) {
      try {
        const email = contact.email.trim().toLowerCase();
        const existing = await this.prisma.contact.findFirst({
          where: { tenantId, email },
        });

        if (existing) {
          await this.prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: contact.firstName,
              lastName: contact.lastName,
              phone: contact.phone,
            },
          });
        } else {
          await this.prisma.contact.create({
            data: {
              tenantId,
              email,
              firstName: contact.firstName,
              lastName: contact.lastName,
              phone: contact.phone,
            },
          });
        }

        upserted += 1;
      } catch (error) {
        errors.push({
          email: contact.email,
          reason: error instanceof Error ? error.message : 'Erreur inconnue',
        });
      }
    }

    return {
      upserted,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async findAll(tenantId: string, query: QueryContactsDto) {
    const where: Prisma.ContactWhereInput = { tenantId };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        orders: {
          include: { items: true },
          orderBy: { placedAt: 'desc' },
        },
        segmentMembers: {
          include: {
            segment: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  async update(tenantId: string, id: string, dto: UpdateContactDto) {
    await this.ensureExists(tenantId, id);

    const email = dto.email?.trim().toLowerCase();
    if (email) {
      const existing = await this.prisma.contact.findFirst({
        where: { tenantId, email },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('Contact email already exists');
      }
    }

    return this.prisma.contact.update({
      where: { id },
      data: {
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.ensureExists(tenantId, id);
    await this.prisma.contact.delete({ where: { id } });
  }

  private async ensureExists(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }
}
