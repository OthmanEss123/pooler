import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ConnectWordPressDto } from './dto/connect-wordpress.dto';
import {
  WordPressApiClient,
  type WordPressCredentials,
  type WordPressUser,
} from './wordpress-api.client';
import {
  WordPressMapper,
  type MappedWordPressContact,
  type MappedWordPressPost,
} from './wordpress-mapper';

type StoredWordPressCredentials = WordPressCredentials & {
  siteUrl: string;
};

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly wordPressApiClient: WordPressApiClient,
    private readonly wordPressMapper: WordPressMapper,
  ) {}

  async connect(tenantId: string, dto: ConnectWordPressDto) {
    const normalizedSiteUrl = this.normalizeSiteUrl(dto.siteUrl);

    await this.wordPressApiClient.testConnection(normalizedSiteUrl, {
      consumerKey: dto.consumerKey,
      consumerSecret: dto.consumerSecret,
    });

    const encryptedCredentials = this.encryptionService.encryptJson({
      siteUrl: normalizedSiteUrl,
      consumerKey: dto.consumerKey,
      consumerSecret: dto.consumerSecret,
    });

    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WORDPRESS,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: toInputJsonValue({
          provider: 'wordpress',
          siteUrl: normalizedSiteUrl,
          connectedAt: new Date().toISOString(),
        }),
      },
      create: {
        tenantId,
        type: IntegrationType.WORDPRESS,
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: toInputJsonValue({
          provider: 'wordpress',
          siteUrl: normalizedSiteUrl,
          connectedAt: new Date().toISOString(),
        }),
      },
    });

    this.launchInitialSync(tenantId);

    return integration;
  }

  async disconnect(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    return this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
      },
    });
  }

  async getStatus(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WORDPRESS,
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        metadata: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!integration) {
      return {
        connected: false,
        provider: 'wordpress',
        status: IntegrationStatus.DISCONNECTED,
      };
    }

    return {
      connected: integration.status === IntegrationStatus.ACTIVE,
      provider: 'wordpress',
      ...integration,
    };
  }

  async syncUsers(tenantId: string) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getCredentialsFromIntegration(integration);

    let page = 1;
    let synced = 0;
    let hasMore = true;

    while (hasMore) {
      const users = await this.wordPressApiClient.getUsers(
        credentials.siteUrl,
        credentials,
        page,
      );

      for (const user of users) {
        const mapped = this.wordPressMapper.mapUserToContact(user);

        if (!mapped.email) {
          continue;
        }

        await this.upsertContactFillMissing(tenantId, mapped);
        synced += 1;
      }

      hasMore = users.length === 100;
      page += 1;
    }

    await this.touchLastSync(tenantId);

    return { synced };
  }

  async syncPosts(tenantId: string) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getCredentialsFromIntegration(integration);

    let page = 1;
    let synced = 0;
    let hasMore = true;

    while (hasMore) {
      const posts = await this.wordPressApiClient.getPosts(
        credentials.siteUrl,
        credentials,
        page,
      );

      for (const post of posts) {
        const mapped = this.wordPressMapper.mapPost(post);

        if (!mapped.externalId || !mapped.title || !mapped.url) {
          continue;
        }

        await this.upsertPost(tenantId, mapped, post);
        synced += 1;
      }

      hasMore = posts.length === 100;
      page += 1;
    }

    await this.touchLastSync(tenantId);

    return { synced };
  }

  async handleWebhook(
    tenantId: string,
    event: string,
    payload: Record<string, unknown>,
    providedSecret?: string,
  ) {
    await this.getActiveIntegration(tenantId);
    this.assertWebhookSecret(providedSecret);

    switch (event) {
      case 'user_register': {
        const mapped = this.wordPressMapper.mapUserToContact(
          this.normalizeWebhookUser(payload),
        );

        if (mapped.email) {
          await this.upsertContactFillMissing(tenantId, mapped);
        }
        break;
      }

      case 'user_updated': {
        const mapped = this.wordPressMapper.mapUserToContact(
          this.normalizeWebhookUser(payload),
        );

        if (mapped.email) {
          await this.updateExistingContact(tenantId, mapped);
        }
        break;
      }

      default:
        this.logger.warn(`Evenement WordPress non gere: ${event}`);
        break;
    }

    return { received: true };
  }

  private async getIntegration(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WORDPRESS,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration WordPress introuvable');
    }

    return integration;
  }

  private async getActiveIntegration(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new NotFoundException('Integration WordPress active introuvable');
    }

    return integration;
  }

  private getCredentialsFromIntegration(integration: {
    credentials: string | null;
  }): StoredWordPressCredentials {
    if (!integration.credentials) {
      throw new BadRequestException('Credentials WordPress absents');
    }

    return this.encryptionService.decryptJson<StoredWordPressCredentials>(
      integration.credentials,
    );
  }

  private async upsertContactFillMissing(
    tenantId: string,
    mapped: MappedWordPressContact,
  ) {
    const normalizedEmail = this.normalizeEmail(mapped.email);

    if (!normalizedEmail) {
      return null;
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        email: normalizedEmail,
      },
    });

    if (!existing) {
      return this.prisma.contact.create({
        data: {
          tenantId,
          email: normalizedEmail,
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          sourceChannel: mapped.sourceChannel,
          properties: toInputJsonValue(mapped.properties),
        },
      });
    }

    const data: Prisma.ContactUpdateInput = {};

    if (this.isMissingValue(existing.firstName) && mapped.firstName) {
      data.firstName = mapped.firstName;
    }

    if (this.isMissingValue(existing.lastName) && mapped.lastName) {
      data.lastName = mapped.lastName;
    }

    if (this.isMissingValue(existing.sourceChannel)) {
      data.sourceChannel = mapped.sourceChannel;
    }

    const mergedProperties = this.mergeProperties(
      existing.properties,
      mapped.properties,
      false,
    );

    if (mergedProperties) {
      data.properties = toInputJsonValue(mergedProperties);
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.contact.update({
      where: { id: existing.id },
      data,
    });
  }

  private async updateExistingContact(
    tenantId: string,
    mapped: MappedWordPressContact,
  ) {
    const normalizedEmail = this.normalizeEmail(mapped.email);

    if (!normalizedEmail) {
      return null;
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        tenantId,
        email: normalizedEmail,
      },
    });

    if (!existing) {
      return null;
    }

    return this.prisma.contact.update({
      where: { id: existing.id },
      data: {
        firstName: mapped.firstName ?? existing.firstName,
        lastName: mapped.lastName ?? existing.lastName,
        sourceChannel: mapped.sourceChannel,
        properties: toInputJsonValue(
          this.mergeProperties(existing.properties, mapped.properties, true) ??
            mapped.properties,
        ),
      },
    });
  }

  private async upsertPost(
    tenantId: string,
    mapped: MappedWordPressPost,
    rawPayload: unknown,
  ) {
    return this.prisma.wordPressPost.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId: mapped.externalId,
        },
      },
      update: {
        title: mapped.title,
        url: mapped.url,
        publishedAt: this.parseDate(mapped.publishedAt),
        category: mapped.category,
        rawPayload: toInputJsonValue(rawPayload),
      },
      create: {
        tenantId,
        externalId: mapped.externalId,
        title: mapped.title,
        url: mapped.url,
        publishedAt: this.parseDate(mapped.publishedAt),
        category: mapped.category,
        rawPayload: toInputJsonValue(rawPayload),
      },
    });
  }

  private mergeProperties(
    existing: Prisma.JsonValue | null,
    incoming: Record<string, unknown>,
    overwrite: boolean,
  ): Record<string, unknown> | null {
    const base = this.asRecord(existing);
    let changed = false;

    for (const [key, value] of Object.entries(incoming)) {
      if (value === undefined) {
        continue;
      }

      if (overwrite || this.isMissingValue(base[key])) {
        const currentSerialized = JSON.stringify(base[key] ?? null);
        const nextSerialized = JSON.stringify(value);

        if (currentSerialized !== nextSerialized) {
          base[key] = value;
          changed = true;
        }
      }
    }

    if (!changed && Object.keys(base).length === 0) {
      return null;
    }

    return base;
  }

  private asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private parseDate(value: string | null) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeWebhookUser(
    payload: Record<string, unknown>,
  ): WordPressUser {
    return {
      id: this.readScalar(payload.id ?? payload.ID),
      email: this.readString(payload.email),
      name: this.readString(payload.name ?? payload.display_name),
      slug: this.readString(payload.slug ?? payload.user_nicename),
      username: this.readString(payload.username ?? payload.user_login),
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter(
            (role): role is string => typeof role === 'string',
          )
        : [],
    };
  }

  private readScalar(value: unknown): string | number | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    return undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private normalizeEmail(email: string | null) {
    return email?.trim().toLowerCase() ?? null;
  }

  private normalizeSiteUrl(siteUrl: string) {
    return siteUrl.replace(/\/+$/, '');
  }

  private isMissingValue(value: unknown) {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return false;
  }

  private assertWebhookSecret(providedSecret?: string) {
    const expectedSecret = process.env.WORDPRESS_WEBHOOK_SECRET?.trim();

    if (!expectedSecret) {
      return;
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new BadRequestException('Secret webhook WordPress invalide');
    }
  }

  private async touchLastSync(tenantId: string) {
    await this.prisma.integration.update({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WORDPRESS,
        },
      },
      data: {
        lastSyncAt: new Date(),
      },
    });
  }

  private launchInitialSync(tenantId: string) {
    setImmediate(() => {
      void this.syncUsers(tenantId)
        .then(async () => this.syncPosts(tenantId))
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Erreur inconnue';
          this.logger.error(
            `Sync initiale WordPress echouee pour ${tenantId}: ${message}`,
          );
        });
    });
  }
}
