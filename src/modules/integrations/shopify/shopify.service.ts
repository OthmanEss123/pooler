import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationStatus, IntegrationType, Prisma } from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly syncQueueService: SyncQueueService,
  ) {}

  async connect(tenantId: string, shop: string, accessToken: string) {
    const encryptedCredentials = this.encryptionService.encryptJson({
      accessToken,
      shop,
    });

    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.SHOPIFY,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'shopify',
          shop,
          connectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
      create: {
        tenantId,
        type: IntegrationType.SHOPIFY,
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: {
          provider: 'shopify',
          shop,
          connectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    });

    await this.syncQueueService.syncShopify(tenantId);

    return {
      success: true,
      integrationId: integration.id,
      status: integration.status,
    };
  }

  async disconnect(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        credentials: null,
        metadata: {
          provider: 'shopify',
          disconnectedAt: new Date().toISOString(),
        } as Prisma.JsonObject,
      },
    });

    return { success: true };
  }

  async getStatus(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.SHOPIFY,
        },
      },
    });

    return {
      connected: integration?.status === IntegrationStatus.ACTIVE,
      status: integration?.status ?? null,
      lastSyncAt: integration?.lastSyncAt ?? null,
    };
  }

  async shopifyFetch(
    url: string,
    options: RequestInit,
    retries = 3,
  ): Promise<unknown> {
    const res = await fetch(url, options);

    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '2', 10);
      this.logger.warn(
        `Shopify 429 — retry dans ${retryAfter}s (${retries} restants)`,
      );
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return this.shopifyFetch(url, options, retries - 1);
    }

    if (!res.ok) {
      throw new BadRequestException(`Shopify API error: ${res.status}`);
    }

    return res.json();
  }

  private async getIntegration(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.SHOPIFY,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration Shopify introuvable');
    }

    return integration;
  }
}
