import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { format } from 'fast-csv';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BulkUpsertContactsDto } from './dto/bulk-upsert-contacts.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { FlowTriggerType } from '../flows/dto/create-flow.dto';
import { FlowsService } from '../flows/flows.service';
import { QuotaService } from '../billing/quota.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowsService: FlowsService,
    private readonly quotaService: QuotaService,
  ) {}

  async create(tenantId: string, dto: CreateContactDto) {
    await this.quotaService.checkContactLimit(tenantId);

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
    const where = this.buildWhere(tenantId, query);
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

  async streamCsv(
    tenantId: string,
    query: QueryContactsDto,
    res: Response,
  ): Promise<void> {
    const contacts = await this.prisma.contact.findMany({
      where: this.buildWhere(tenantId, query),
      orderBy: { createdAt: 'desc' },
      include: {
        healthScore: {
          select: {
            segment: true,
          },
        },
      },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    for (const contact of contacts) {
      const avgOrderValue =
        contact.totalOrders > 0
          ? Number(contact.totalRevenue) / contact.totalOrders
          : 0;

      csvStream.write({
        email: contact.email,
        firstName: contact.firstName ?? '',
        lastName: contact.lastName ?? '',
        phone: contact.phone ?? '',
        emailStatus: contact.emailStatus,
        totalOrders: contact.totalOrders,
        totalRevenue: Number(contact.totalRevenue),
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        firstOrderAt: contact.firstOrderAt?.toISOString() ?? '',
        lastOrderAt: contact.lastOrderAt?.toISOString() ?? '',
        sourceChannel: contact.sourceChannel ?? '',
        rfmSegment: contact.healthScore?.segment ?? '',
        createdAt: contact.createdAt.toISOString(),
      });
    }

    csvStream.end();

    await new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', reject);
      csvStream.on('error', reject);
    });
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

  private buildWhere(tenantId: string, query: QueryContactsDto) {
    const where: Prisma.ContactWhereInput = { tenantId };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
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
