import { Injectable } from '@nestjs/common';
import { Prisma, RfmSegment } from '@prisma/client';
import { GrpcMethod } from '@nestjs/microservices';
import { PrismaService } from '../../database/prisma/prisma.service';

type ContactWithHealthScore = {
  id: string;
  tenantId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
  healthScore: {
    rfmScore: number;
  } | null;
};

@Injectable()
export class ContactsGrpcService {
  constructor(private readonly prisma: PrismaService) {}

  @GrpcMethod('ContactsService', 'GetContact')
  async getContact(data: { id: string; tenantId: string }) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: data.id,
        tenantId: data.tenantId,
      },
      include: {
        healthScore: {
          select: {
            rfmScore: true,
          },
        },
      },
    });

    if (!contact) {
      return {};
    }

    return {
      contact: this.serializeContact(contact),
    };
  }

  @GrpcMethod('ContactsService', 'ListContacts')
  async listContacts(data: {
    tenantId: string;
    filterJson?: string;
    page?: number;
    limit?: number;
  }) {
    const page = data.page && data.page > 0 ? data.page : 1;
    const limit = data.limit && data.limit > 0 ? data.limit : 20;
    const skip = (page - 1) * limit;

    let extraWhere: Prisma.ContactWhereInput = {};
    if (data.filterJson) {
      try {
        const parsed: unknown = JSON.parse(data.filterJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          extraWhere = parsed as Prisma.ContactWhereInput;
        }
      } catch {
        extraWhere = {};
      }
    }

    const where: Prisma.ContactWhereInput = {
      AND: [{ tenantId: data.tenantId }, extraWhere],
    };

    const [contacts, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: limit,
        include: {
          healthScore: {
            select: {
              rfmScore: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      contacts: contacts.map((contact) => this.serializeContact(contact)),
      total,
    };
  }

  @GrpcMethod('ContactsService', 'GetSegmentContacts')
  async getSegmentContacts(data: { tenantId: string; segmentId: string }) {
    const members = await this.prisma.segmentMember.findMany({
      where: {
        segmentId: data.segmentId,
        contact: {
          tenantId: data.tenantId,
        },
      },
      include: {
        contact: {
          include: {
            healthScore: {
              select: {
                rfmScore: true,
              },
            },
          },
        },
      },
      orderBy: {
        addedAt: 'desc',
      },
    });

    return {
      contacts: members.map((member) => this.serializeContact(member.contact)),
      total: members.length,
    };
  }

  @GrpcMethod('ContactsService', 'UpdateHealthScore')
  async updateHealthScore(data: {
    tenantId: string;
    contactId: string;
    score: number;
  }) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: data.contactId,
        tenantId: data.tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!contact) {
      return {
        contactId: data.contactId,
        score: 0,
        status: 'not_found',
      };
    }

    const normalizedScore = this.clampScore(data.score);
    const existing = await this.prisma.customerHealthScore.findUnique({
      where: {
        contactId: data.contactId,
      },
    });

    const saved = await this.prisma.customerHealthScore.upsert({
      where: {
        contactId: data.contactId,
      },
      update: {
        tenantId: data.tenantId,
        segment: this.mapSegment(normalizedScore),
        rfmScore: normalizedScore,
        recencyScore: existing?.recencyScore ?? normalizedScore,
        frequencyScore: existing?.frequencyScore ?? normalizedScore,
        monetaryScore: existing?.monetaryScore ?? normalizedScore,
        churnRisk: Number((1 - normalizedScore / 100).toFixed(2)),
        predictedLtv: existing?.predictedLtv ?? null,
        calculatedAt: new Date(),
      },
      create: {
        tenantId: data.tenantId,
        contactId: data.contactId,
        segment: this.mapSegment(normalizedScore),
        rfmScore: normalizedScore,
        recencyScore: normalizedScore,
        frequencyScore: normalizedScore,
        monetaryScore: normalizedScore,
        churnRisk: Number((1 - normalizedScore / 100).toFixed(2)),
        predictedLtv: null,
      },
    });

    return {
      contactId: saved.contactId,
      score: saved.rfmScore,
      status: existing ? 'updated' : 'created',
    };
  }

  @GrpcMethod('ContactsService', 'BulkUpsertContacts')
  async bulkUpsertContacts(data: {
    contacts?: Array<{
      tenantId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    }>;
  }) {
    let count = 0;

    for (const item of data.contacts ?? []) {
      const email = item.email?.trim().toLowerCase();
      if (!email) {
        continue;
      }

      await this.prisma.contact.upsert({
        where: {
          tenantId_email: {
            tenantId: item.tenantId,
            email,
          },
        },
        update: {
          firstName: item.firstName?.trim() || null,
          lastName: item.lastName?.trim() || null,
          phone: item.phone?.trim() || null,
        },
        create: {
          tenantId: item.tenantId,
          email,
          firstName: item.firstName?.trim() || null,
          lastName: item.lastName?.trim() || null,
          phone: item.phone?.trim() || null,
        },
      });

      count += 1;
    }

    return {
      count,
      status: 'success',
    };
  }

  private serializeContact(contact: ContactWithHealthScore) {
    return {
      id: contact.id,
      tenantId: contact.tenantId,
      email: contact.email,
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      phone: contact.phone ?? '',
      healthScore: contact.healthScore?.rfmScore ?? 0,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    };
  }

  private clampScore(score: number) {
    if (!Number.isFinite(score)) {
      return 0;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
  }

  private mapSegment(score: number): RfmSegment {
    if (score >= 80) return RfmSegment.CHAMPION;
    if (score >= 65) return RfmSegment.LOYAL;
    if (score >= 50) return RfmSegment.POTENTIAL;
    if (score >= 35) return RfmSegment.NEW;
    if (score >= 20) return RfmSegment.AT_RISK;
    if (score >= 10) return RfmSegment.CANT_LOSE;
    return RfmSegment.LOST;
  }
}
