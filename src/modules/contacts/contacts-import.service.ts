import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { EmailStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import csv from 'csv-parser';
import { Readable } from 'stream';

interface ParsedContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  sourceChannel?: string;
  tags?: string[];
  emailStatus?: EmailStatus;
  totalRevenue?: number;
}

interface ParseResult {
  contacts: ParsedContact[];
  errors: string[];
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class ContactsImportService {
  private readonly logger = new Logger(ContactsImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  async parseCsv(buffer: Buffer): Promise<ParseResult> {
    const clean =
      buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
        ? buffer.slice(3)
        : buffer;

    return new Promise((resolve, reject) => {
      const contacts: ParsedContact[] = [];
      const errors: string[] = [];

      Readable.from(clean)
        .pipe(csv())
        .on('headers', (headers: string[]) => {
          const normalizedHeaders = headers.map((value) =>
            value.trim().toLowerCase(),
          );

          if (!normalizedHeaders.includes('email')) {
            reject(
              new BadRequestException(
                'Colonne "email" obligatoire absente du CSV',
              ),
            );
          }
        })
        .on('data', (row: Record<string, string>) => {
          const email = row['email']?.trim().toLowerCase();

          if (!email || !this.isValidEmail(email)) {
            errors.push(
              `Ligne ignoree - email invalide: "${row['email'] ?? 'vide'}"`,
            );
            return;
          }

          const tags = row['tags']
            ? row['tags']
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : undefined;

          const totalRevenueRaw = row['totalrevenue'] ?? row['totalRevenue'];
          const totalRevenue =
            totalRevenueRaw !== undefined && totalRevenueRaw !== ''
              ? Number.parseFloat(totalRevenueRaw)
              : undefined;

          const emailStatus = row['emailstatus'] ?? row['emailStatus'];
          const validStatuses: EmailStatus[] = [
            EmailStatus.SUBSCRIBED,
            EmailStatus.UNSUBSCRIBED,
            EmailStatus.BOUNCED,
            EmailStatus.COMPLAINED,
          ];
          const upperEmailStatus = emailStatus?.toUpperCase() as
            | EmailStatus
            | undefined;
          const parsedStatus =
            upperEmailStatus && validStatuses.includes(upperEmailStatus)
              ? upperEmailStatus
              : undefined;

          contacts.push({
            email,
            firstName: row['firstname'] || row['firstName'] || undefined,
            lastName: row['lastname'] || row['lastName'] || undefined,
            phone: row['phone'] || undefined,
            sourceChannel:
              row['sourcechannel'] || row['sourceChannel'] || undefined,
            tags,
            emailStatus: parsedStatus,
            totalRevenue:
              totalRevenue === undefined || Number.isNaN(totalRevenue)
                ? undefined
                : totalRevenue,
          });
        })
        .on('end', () => resolve({ contacts, errors }))
        .on('error', (err: Error) => reject(err));
    });
  }

  async importFromCsv(tenantId: string, buffer: Buffer): Promise<ImportResult> {
    const { contacts: parsed, errors: parseErrors } =
      await this.parseCsv(buffer);

    if (parsed.length === 0) {
      return {
        imported: 0,
        updated: 0,
        skipped: parseErrors.length,
        errors: parseErrors,
      };
    }

    const emails = parsed.map((contact) => contact.email);
    const existing = await this.prisma.contact.findMany({
      where: { tenantId, email: { in: emails } },
    });
    const existingMap = new Map(
      existing.map((contact) => [contact.email, contact]),
    );

    const toCreate = parsed.filter(
      (contact) => !existingMap.has(contact.email),
    );
    const toUpdate = parsed.filter((contact) => existingMap.has(contact.email));

    if (toCreate.length > 0) {
      await this.quota.checkContactLimit(tenantId, toCreate.length);
    }

    let updated = 0;

    if (toCreate.length > 0) {
      await this.prisma.contact.createMany({
        data: toCreate.map((contact) => ({
          tenantId,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          sourceChannel: contact.sourceChannel,
          emailStatus: contact.emailStatus ?? EmailStatus.SUBSCRIBED,
          totalRevenue: contact.totalRevenue ?? 0,
          properties: contact.tags ? { tags: contact.tags } : {},
        })),
        skipDuplicates: true,
      });
    }

    for (const contact of toUpdate) {
      const existingContact = existingMap.get(contact.email);
      if (!existingContact) {
        continue;
      }

      const updates: Record<string, unknown> = {};

      if (!existingContact.firstName && contact.firstName) {
        updates.firstName = contact.firstName;
      }
      if (!existingContact.lastName && contact.lastName) {
        updates.lastName = contact.lastName;
      }
      if (!existingContact.phone && contact.phone) {
        updates.phone = contact.phone;
      }
      if (!existingContact.sourceChannel && contact.sourceChannel) {
        updates.sourceChannel = contact.sourceChannel;
      }

      const existingProperties =
        existingContact.properties &&
        typeof existingContact.properties === 'object'
          ? (existingContact.properties as Prisma.JsonObject)
          : {};
      const existingTagsRaw = existingProperties['tags'];
      const existingTags = Array.isArray(existingTagsRaw)
        ? existingTagsRaw
        : [];

      if (existingTags.length === 0 && contact.tags?.length) {
        updates.properties = { ...existingProperties, tags: contact.tags };
      }

      if (Object.keys(updates).length > 0) {
        await this.prisma.contact.update({
          where: { id: existingContact.id },
          data: updates,
        });
        updated += 1;
      }
    }

    this.logger.log(
      `Import CSV tenant ${tenantId}: ${toCreate.length} imported, ${updated} updated, ${parseErrors.length} skipped`,
    );

    return {
      imported: toCreate.length,
      updated,
      skipped: parseErrors.length,
      errors: parseErrors,
    };
  }

  getTemplate(): string {
    return (
      'email,firstName,lastName,phone,' +
      'sourceChannel,tags,emailStatus,totalRevenue\n'
    );
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
