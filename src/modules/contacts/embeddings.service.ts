import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

type EmbeddableContact = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  sourceChannel: string | null;
  properties: Record<string, unknown> | null;
  totalOrders: number;
  totalRevenue: Prisma.Decimal | number | string | null;
};

@Injectable()
export class EmbeddingsService {
  constructor(private readonly prisma: PrismaService) {}

  private getScalarText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    return '';
  }

  private getTags(properties: Record<string, unknown> | null): string {
    if (!properties || !Array.isArray(properties.tags)) {
      return '';
    }

    return properties.tags
      .filter((tag): tag is string => typeof tag === 'string')
      .join(' ');
  }

  private buildContactText(contact: EmbeddableContact) {
    const parts = [
      contact.email ?? '',
      contact.firstName ?? '',
      contact.lastName ?? '',
      contact.sourceChannel ?? '',
      this.getTags(contact.properties),
      `orders:${contact.totalOrders}`,
      `revenue:${this.getScalarText(contact.totalRevenue) || '0'}`,
    ];

    return parts.filter(Boolean).join(' ').trim();
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.OPENAI_API_KEY) {
      return this.fallbackEmbedding(text);
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException('Erreur OpenAI embeddings');
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;

    if (!embedding) {
      throw new BadRequestException('Embedding OpenAI absent');
    }

    return embedding;
  }

  private fallbackEmbedding(text: string): number[] {
    const vector = new Array<number>(1536).fill(0);
    const bytes = Buffer.from(text, 'utf8');

    for (let index = 0; index < bytes.length; index += 1) {
      vector[index % 1536] += bytes[index] / 255;
    }

    const norm =
      Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
  }

  async embedContact(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: contactId,
        tenantId,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact introuvable');
    }

    const text = this.buildContactText({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      sourceChannel: contact.sourceChannel,
      properties:
        contact.properties && typeof contact.properties === 'object'
          ? (contact.properties as Record<string, unknown>)
          : null,
      totalOrders: contact.totalOrders,
      totalRevenue: contact.totalRevenue,
    });
    const vector = await this.generateEmbedding(text);
    const vectorSql = `[${vector.join(',')}]`;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "Contact"
      SET embedding = $1::vector
      WHERE id = $2
        AND "tenantId" = $3
      `,
      vectorSql,
      contactId,
      tenantId,
    );

    return { embedded: 1 };
  }

  async embedAllContacts(tenantId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      select: { id: true },
      take: 100,
    });

    let count = 0;

    for (const contact of contacts) {
      await this.embedContact(tenantId, contact.id);
      count += 1;
    }

    return { embedded: count };
  }

  async findSimilarContacts(tenantId: string, contactId: string, limit = 10) {
    const sourceRows = await this.prisma.$queryRawUnsafe<
      Array<{ embedding: string | null }>
    >(
      `
      SELECT embedding::text as embedding
      FROM "Contact"
      WHERE "tenantId" = $1
        AND id = $2
        AND embedding IS NOT NULL
      LIMIT 1
      `,
      tenantId,
      contactId,
    );

    if (!sourceRows.length || !sourceRows[0].embedding) {
      throw new BadRequestException(
        'Contact sans embedding - lancer embedContact()',
      );
    }

    const sourceEmbedding = sourceRows[0].embedding;
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        totalRevenue: string | null;
        totalOrders: number | null;
        similarity: number;
      }>
    >(
      `
      SELECT
        id,
        email,
        "firstName" as "firstName",
        "lastName" as "lastName",
        "totalRevenue"::text as "totalRevenue",
        "totalOrders" as "totalOrders",
        1 - (embedding <=> $1::vector) AS similarity
      FROM "Contact"
      WHERE "tenantId" = $2
        AND id != $3
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $4
      `,
      sourceEmbedding,
      tenantId,
      contactId,
      Math.min(Math.max(1, limit), 50),
    );

    return rows.map((row) => ({
      contact: {
        id: row.id,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        totalRevenue: row.totalRevenue,
        totalOrders: row.totalOrders,
      },
      similarity: row.similarity,
    }));
  }
}
