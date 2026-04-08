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

  // ── Parser CSV ────────────────────────────────────
  async parseCsv(buffer: Buffer): Promise<ParsedContact[]> {
    // Supprimer BOM UTF-8
    const clean =
      buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
        ? buffer.slice(3)
        : buffer;

    return new Promise((resolve, reject) => {
      const results: ParsedContact[] = [];
      const errors: string[] = [];
      let headers: string[] = [];

      const stream = Readable.from(clean);

      stream
        .pipe(csv())
        .on('headers', (h: string[]) => {
          headers = h.map((x) => x.trim().toLowerCase());
          if (!headers.includes('email')) {
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
            errors.push(`Email invalide : ${row['email'] ?? 'vide'}`);
            return;
          }

          const tags = row['tags']
            ? row['tags']
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined;

          const totalRevenue =
            row['totalrevenue'] || row['totalRevenue']
              ? parseFloat(row['totalrevenue'] ?? row['totalRevenue'])
              : undefined;

          const emailStatus = row['emailstatus'] || row['emailStatus'];
          const validStatuses: EmailStatus[] = [
            EmailStatus.SUBSCRIBED,
            EmailStatus.UNSUBSCRIBED,
            EmailStatus.BOUNCED,
            EmailStatus.COMPLAINED,
          ];
          const upperEmailStatus = emailStatus?.toUpperCase() as
            | EmailStatus
            | undefined;
          const parsedStatus: EmailStatus | undefined =
            upperEmailStatus && validStatuses.includes(upperEmailStatus)
              ? upperEmailStatus
              : undefined;

          results.push({
            email,
            firstName: row['firstname'] || row['firstName'] || undefined,
            lastName: row['lastname'] || row['lastName'] || undefined,
            phone: row['phone'] || undefined,
            sourceChannel:
              row['sourcechannel'] || row['sourceChannel'] || undefined,
            tags,
            emailStatus: parsedStatus,
            totalRevenue: isNaN(totalRevenue!) ? undefined : totalRevenue,
          });
        })
        .on('end', () => resolve(results))
        .on('error', (err: Error) => reject(err));
    });
  }

  // ── Import principal ──────────────────────────────
  async importFromCsv(tenantId: string, buffer: Buffer): Promise<ImportResult> {
    const parsed = await this.parseCsv(buffer);

    if (parsed.length === 0) {
      return { imported: 0, updated: 0, skipped: 0, errors: [] };
    }

    const emails = parsed.map((p) => p.email);

    // Charger les contacts existants en 1 requête
    const existing = await this.prisma.contact.findMany({
      where: { tenantId, email: { in: emails } },
    });
    const existingMap = new Map(existing.map((c) => [c.email, c]));

    const toCreate = parsed.filter((p) => !existingMap.has(p.email));
    const toUpdate = parsed.filter((p) => existingMap.has(p.email));

    // Vérifier quota uniquement sur les nouveaux
    if (toCreate.length > 0) {
      await this.quota.checkContactLimit(tenantId, toCreate.length);
    }

    const errors: string[] = [];
    let updated = 0;

    // Créer les nouveaux contacts
    if (toCreate.length > 0) {
      await this.prisma.contact.createMany({
        data: toCreate.map((p) => ({
          tenantId,
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
          sourceChannel: p.sourceChannel,
          emailStatus: p.emailStatus ?? EmailStatus.SUBSCRIBED,
          totalRevenue: p.totalRevenue ?? 0,
          properties: p.tags ? { tags: p.tags } : {},
        })),
        skipDuplicates: true,
      });
    }

    // Mettre à jour les existants — Fill Missing Only
    for (const p of toUpdate) {
      const existing = existingMap.get(p.email)!;
      const updates: Record<string, unknown> = {};

      if (!existing.firstName && p.firstName) updates.firstName = p.firstName;
      if (!existing.lastName && p.lastName) updates.lastName = p.lastName;
      if (!existing.phone && p.phone) updates.phone = p.phone;
      if (!existing.sourceChannel && p.sourceChannel)
        updates.sourceChannel = p.sourceChannel;

      // Tags — merge si vide
      const existingProperties =
        existing.properties && typeof existing.properties === 'object'
          ? (existing.properties as Prisma.JsonObject)
          : {};
      const existingTagsRaw = existingProperties['tags'];
      const existingTags = Array.isArray(existingTagsRaw)
        ? existingTagsRaw
        : [];
      if (existingTags.length === 0 && p.tags?.length) {
        updates.properties = { ...existingProperties, tags: p.tags };
      }

      if (Object.keys(updates).length > 0) {
        await this.prisma.contact.update({
          where: { id: existing.id },
          data: updates,
        });
        updated++;
      }
    }

    this.logger.log(
      `Import CSV tenant ${tenantId}: ` +
        `${toCreate.length} importés, ${updated} mis à jour`,
    );

    return {
      imported: toCreate.length,
      updated,
      skipped: 0,
      errors,
    };
  }

  // ── Template CSV ──────────────────────────────────
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
