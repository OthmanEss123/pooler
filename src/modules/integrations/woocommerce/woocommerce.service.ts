import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  IntegrationStatus,
  IntegrationType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { EncryptionService } from '../../../common/services/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';
import { FlowTriggerType } from '../../flows/dto/create-flow.dto';
import { FlowsService } from '../../flows/flows.service';
import { ConnectWooCommerceDto } from './dto/connect-woocommerce.dto';

type WooCredentials = {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

type WooBilling = {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
};

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    @Inject(forwardRef(() => FlowsService))
    private readonly flowsService: FlowsService,
    private readonly syncQueueService: SyncQueueService,
  ) {}

  async connect(tenantId: string, dto: ConnectWooCommerceDto) {
    const normalizedSiteUrl = this.normalizeSiteUrl(dto.siteUrl);
    const authHeader = this.buildBasicAuthHeader(
      dto.consumerKey,
      dto.consumerSecret,
    );
    const testUrl = `${normalizedSiteUrl}/wp-json/wc/v3/orders?per_page=1`;

    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });

    if (!testResponse.ok) {
      throw new BadRequestException('Credentials WooCommerce invalides');
    }

    const encryptedCredentials = this.encryptionService.encrypt(
      JSON.stringify({
        siteUrl: normalizedSiteUrl,
        consumerKey: dto.consumerKey,
        consumerSecret: dto.consumerSecret,
      }),
    );

    const integration = await this.prisma.integration.upsert({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WOOCOMMERCE,
        },
      },
      update: {
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: toInputJsonValue({
          provider: 'woocommerce',
          siteUrl: normalizedSiteUrl,
          connectedAt: new Date().toISOString(),
        }),
      },
      create: {
        tenantId,
        type: IntegrationType.WOOCOMMERCE,
        status: IntegrationStatus.ACTIVE,
        credentials: encryptedCredentials,
        metadata: toInputJsonValue({
          provider: 'woocommerce',
          siteUrl: normalizedSiteUrl,
          connectedAt: new Date().toISOString(),
        }),
      },
    });

    await this.syncQueueService.syncWoocommerce(tenantId, true);

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
          type: IntegrationType.WOOCOMMERCE,
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
        status: IntegrationStatus.DISCONNECTED,
        provider: 'woocommerce',
      };
    }

    return {
      connected: integration.status === IntegrationStatus.ACTIVE,
      provider: 'woocommerce',
      ...integration,
    };
  }

  async syncOrders(tenantId: string, full = false) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getCredentialsFromIntegration(integration);
    const headers = this.getAuthHeaders(credentials);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        per_page: '100',
        page: String(page),
        orderby: 'modified',
        order: 'desc',
      });

      if (!full && integration.lastSyncAt) {
        params.append('modified_after', integration.lastSyncAt.toISOString());
      }

      const url = `${credentials.siteUrl}/wp-json/wc/v3/orders?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Erreur syncOrders page ${page}: ${errorText}`);
        throw new BadRequestException(
          'Erreur lors de la synchronisation des commandes WooCommerce',
        );
      }

      const orders = (await response.json()) as unknown[];

      if (!Array.isArray(orders) || orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const order of orders) {
        await this.upsertOrder(tenantId, order as Record<string, unknown>);
      }

      page += 1;

      if (orders.length < 100) {
        hasMore = false;
      }
    }

    await this.touchLastSync(tenantId);

    return { success: true };
  }

  async syncProducts(tenantId: string) {
    const integration = await this.getActiveIntegration(tenantId);
    const credentials = this.getCredentialsFromIntegration(integration);
    const headers = this.getAuthHeaders(credentials);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        per_page: '100',
        page: String(page),
      });
      const url = `${credentials.siteUrl}/wp-json/wc/v3/products?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Erreur syncProducts page ${page}: ${errorText}`);
        throw new BadRequestException(
          'Erreur lors de la synchronisation des produits WooCommerce',
        );
      }

      const products = (await response.json()) as unknown[];

      if (!Array.isArray(products) || products.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of products) {
        await this.upsertProduct(tenantId, product as Record<string, unknown>);
      }

      page += 1;

      if (products.length < 100) {
        hasMore = false;
      }
    }

    await this.touchLastSync(tenantId);

    return { success: true };
  }

  async upsertOrder(tenantId: string, wcOrder: Record<string, unknown>) {
    const billing = this.asBilling(wcOrder.billing);
    const externalId = this.getNullableString(wcOrder.id);

    if (!externalId) {
      throw new BadRequestException('Commande WooCommerce sans id');
    }

    const contact = await this.findOrCreateContact(
      tenantId,
      billing,
      externalId,
    );
    const status = this.mapOrderStatus(
      this.getString(wcOrder.status, 'pending'),
    );
    const placedAt = this.parseDate(wcOrder.date_created);
    const orderNumber = this.getString(wcOrder.number, externalId);
    const currency = this.getString(wcOrder.currency, 'USD');

    const order = await this.prisma.$transaction(async (tx) => {
      const upsertedOrder = await tx.order.upsert({
        where: {
          tenantId_externalId: {
            tenantId,
            externalId,
          },
        },
        update: {
          tenantId,
          contactId: contact.id,
          orderNumber,
          status,
          totalAmount: this.parseDecimal(wcOrder.total),
          subtotal: this.parseDecimal(wcOrder.total),
          currency,
          source: 'woocommerce',
          rawPayload: toInputJsonValue(wcOrder),
          placedAt,
        },
        create: {
          tenantId,
          contactId: contact.id,
          externalId,
          orderNumber,
          status,
          totalAmount: this.parseDecimal(wcOrder.total),
          subtotal: this.parseDecimal(wcOrder.total),
          currency,
          source: 'woocommerce',
          rawPayload: toInputJsonValue(wcOrder),
          placedAt,
        },
      });

      await tx.orderItem.deleteMany({
        where: {
          orderId: upsertedOrder.id,
        },
      });

      const lineItems = this.getRecordArray(wcOrder.line_items);

      if (lineItems.length > 0) {
        await tx.orderItem.createMany({
          data: lineItems.map((record, index) => {
            const itemExternalId =
              this.getNullableString(record.id) ??
              `${externalId}-${this.getNullableString(record.product_id) ?? index}`;

            return {
              tenantId,
              orderId: upsertedOrder.id,
              externalId: itemExternalId,
              productExternalId: this.getNullableString(record.product_id),
              name: this.getString(record.name, 'Unnamed item'),
              sku: this.getNullableString(record.sku),
              quantity: this.parseInteger(record.quantity, 1),
              unitPrice: this.parseDecimal(record.price),
              totalPrice: this.parseDecimal(record.total ?? record.price),
            };
          }),
          skipDuplicates: true,
        });
      }

      return upsertedOrder;
    });

    await this.recalculateContactMetrics(contact.id);

    return {
      order,
      contactId: contact.id,
      status,
    };
  }

  async upsertProduct(tenantId: string, wcProduct: Record<string, unknown>) {
    const externalId = this.getNullableString(wcProduct.id);

    if (!externalId) {
      throw new BadRequestException('Produit WooCommerce sans id');
    }

    const name = this.getString(wcProduct.name, 'Unnamed product');
    const sku = this.getNullableString(wcProduct.sku);
    const price = this.parseDecimal(wcProduct.price);
    const imageUrl = this.extractImageUrl(wcProduct.images);
    const category = this.extractCategory(wcProduct.categories);
    const tags = this.extractTags(wcProduct.tags);
    const isActive = this.getString(wcProduct.status) === 'publish';

    return this.prisma.product.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId,
        },
      },
      update: {
        name,
        sku,
        price,
        imageUrl,
        category,
        tags,
        isActive,
        rawPayload: toInputJsonValue(wcProduct),
      },
      create: {
        tenantId,
        externalId,
        name,
        sku,
        price,
        imageUrl,
        category,
        tags,
        isActive,
        rawPayload: toInputJsonValue(wcProduct),
      },
    });
  }

  async handleWebhook(
    tenantId: string,
    topic: string,
    rawBody: Buffer,
    signature?: string,
  ) {
    const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;

    if (!secret) {
      throw new BadRequestException('WOOCOMMERCE_WEBHOOK_SECRET manquant');
    }

    const computedSig = createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    const expected = Buffer.from(computedSig);
    const received = Buffer.from(signature ?? '');

    if (
      !signature ||
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new BadRequestException('Signature webhook invalide');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as Record<
      string,
      unknown
    >;

    switch (topic) {
      case 'order.created':
      case 'order.updated': {
        const result = await this.upsertOrder(tenantId, payload);

        if (
          result.contactId &&
          (result.status === OrderStatus.PAID ||
            result.status === OrderStatus.FULFILLED)
        ) {
          void this.flowsService.triggerFlowsSafe(
            tenantId,
            FlowTriggerType.POST_PURCHASE,
            result.contactId,
          );
        }
        break;
      }

      case 'order.deleted': {
        const payloadId = this.getNullableString(payload.id);

        if (!payloadId) {
          break;
        }

        const existingOrder = await this.prisma.order.findUnique({
          where: {
            tenantId_externalId: {
              tenantId,
              externalId: payloadId,
            },
          },
          select: {
            id: true,
            contactId: true,
          },
        });

        if (!existingOrder) {
          break;
        }

        await this.prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            status: OrderStatus.CANCELLED,
          },
        });

        await this.recalculateContactMetrics(existingOrder.contactId);
        break;
      }

      case 'product.created':
      case 'product.updated':
        await this.upsertProduct(tenantId, payload);
        break;

      case 'customer.created': {
        const billing = this.asBilling(payload.billing ?? payload);
        const customerId =
          this.getNullableString(payload.id) ?? `${Date.now()}`;

        await this.findOrCreateContact(tenantId, billing, customerId);
        break;
      }

      default:
        this.logger.warn(`Topic non gere: ${topic}`);
        break;
    }

    return { received: true };
  }

  private async getIntegration(tenantId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WOOCOMMERCE,
        },
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration WooCommerce introuvable');
    }

    return integration;
  }

  private async getActiveIntegration(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new NotFoundException('Integration WooCommerce active introuvable');
    }

    return integration;
  }

  private getCredentialsFromIntegration(integration: {
    credentials: string | null;
  }) {
    if (!integration.credentials) {
      throw new BadRequestException('Credentials WooCommerce absents');
    }

    return JSON.parse(
      this.encryptionService.decrypt(integration.credentials),
    ) as WooCredentials;
  }

  private buildBasicAuthHeader(consumerKey: string, consumerSecret: string) {
    const encoded = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
      'base64',
    );
    return `Basic ${encoded}`;
  }

  private getAuthHeaders(credentials: WooCredentials) {
    return {
      Authorization: this.buildBasicAuthHeader(
        credentials.consumerKey,
        credentials.consumerSecret,
      ),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private normalizeSiteUrl(siteUrl: string) {
    return siteUrl.replace(/\/+$/, '');
  }

  private mapOrderStatus(wcStatus: string): OrderStatus {
    switch (wcStatus) {
      case 'pending':
      case 'on-hold':
        return OrderStatus.PENDING;
      case 'processing':
        return OrderStatus.PAID;
      case 'completed':
        return OrderStatus.FULFILLED;
      case 'refunded':
        return OrderStatus.REFUNDED;
      case 'cancelled':
      case 'failed':
        return OrderStatus.CANCELLED;
      default:
        return OrderStatus.PENDING;
    }
  }

  private getString(value: unknown, fallback = ''): string {
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

    return fallback;
  }

  private getNullableString(value: unknown): string | null {
    const normalized = this.getString(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getRecordArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private parseInteger(value: unknown, fallback: number): number {
    const parsed = Number(this.getString(value, String(fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseDecimal(value: unknown): Prisma.Decimal {
    const numeric =
      typeof value === 'string' || typeof value === 'number'
        ? Number(value)
        : value instanceof Prisma.Decimal
          ? Number(value.toString())
          : 0;

    return new Prisma.Decimal(Number.isFinite(numeric) ? numeric : 0);
  }

  private parseDate(value: unknown): Date {
    const candidate = value ? new Date(this.getString(value)) : new Date();
    return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  }

  private asBilling(value: unknown): WooBilling {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const record = value as Record<string, unknown>;

    return {
      email: this.getNullableString(record.email) ?? undefined,
      first_name: this.getNullableString(record.first_name) ?? undefined,
      last_name: this.getNullableString(record.last_name) ?? undefined,
      phone: this.getNullableString(record.phone) ?? undefined,
    };
  }

  private buildGuestEmail(tenantId: string, orderExternalId: string) {
    return `guest+woocommerce-${tenantId}-${orderExternalId}@pilot.local`;
  }

  private async findOrCreateContact(
    tenantId: string,
    billing: WooBilling,
    orderExternalId: string,
  ) {
    const normalizedEmail =
      billing.email?.trim().toLowerCase() ||
      this.buildGuestEmail(tenantId, orderExternalId);

    return this.prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: normalizedEmail,
        },
      },
      update: {
        firstName: billing.first_name || undefined,
        lastName: billing.last_name || undefined,
        phone: billing.phone || undefined,
        sourceChannel: 'woocommerce',
      },
      create: {
        tenantId,
        email: normalizedEmail,
        firstName: billing.first_name || null,
        lastName: billing.last_name || null,
        phone: billing.phone || null,
        sourceChannel: 'woocommerce',
      },
    });
  }

  private async recalculateContactMetrics(contactId: string) {
    const paidOrders = await this.prisma.order.findMany({
      where: {
        contactId,
        status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] },
      },
      select: {
        totalAmount: true,
        placedAt: true,
      },
      orderBy: { placedAt: 'asc' },
    });

    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum.plus(order.totalAmount),
      new Prisma.Decimal(0),
    );

    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        totalOrders: paidOrders.length,
        totalRevenue,
        firstOrderAt: paidOrders[0]?.placedAt ?? null,
        lastOrderAt: paidOrders[paidOrders.length - 1]?.placedAt ?? null,
      },
    });
  }

  private async touchLastSync(tenantId: string) {
    await this.prisma.integration.update({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.WOOCOMMERCE,
        },
      },
      data: {
        lastSyncAt: new Date(),
      },
    });
  }

  private extractImageUrl(images: unknown) {
    const firstImage = this.getRecordArray(images)[0];
    return firstImage ? this.getNullableString(firstImage.src) : null;
  }

  private extractCategory(categories: unknown) {
    const firstCategory = this.getRecordArray(categories)[0];
    return firstCategory ? this.getNullableString(firstCategory.name) : null;
  }

  private extractTags(tags: unknown) {
    return this.getRecordArray(tags)
      .map((tag) => this.getNullableString(tag.name))
      .filter((tag): tag is string => tag !== null);
  }
}
