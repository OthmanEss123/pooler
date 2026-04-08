import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IntegrationStatus,
  IntegrationType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { EncryptionService } from '../../../common/services/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { SyncQueueService } from '../../../queue/services/sync-queue.service';

type ShopifyCredentials = {
  accessToken: string;
  shop: string;
};

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);
  private readonly apiVersion = '2024-01';

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

  async syncOrders(tenantId: string, full = false) {
    const credentials = await this.getActiveCredentials(tenantId);
    const url = new URL(
      `https://${credentials.shop}/admin/api/${this.apiVersion}/orders.json`,
    );
    url.searchParams.set('limit', '250');
    url.searchParams.set('status', 'any');

    const integration = await this.getIntegration(tenantId);
    if (!full && integration.lastSyncAt) {
      url.searchParams.set(
        'updated_at_min',
        integration.lastSyncAt.toISOString(),
      );
    }

    const response = (await this.shopifyFetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(credentials.accessToken),
    })) as { orders?: Array<Record<string, unknown>> };

    let syncedCount = 0;

    for (const order of response.orders ?? []) {
      await this.upsertOrder(tenantId, order);
      syncedCount += 1;
    }

    await this.touchLastSync(tenantId);

    return { success: true, syncedCount };
  }

  async syncProducts(tenantId: string) {
    const credentials = await this.getActiveCredentials(tenantId);
    const url = `https://${credentials.shop}/admin/api/${this.apiVersion}/products.json?limit=250`;
    const response = (await this.shopifyFetch(url, {
      method: 'GET',
      headers: this.getHeaders(credentials.accessToken),
    })) as { products?: Array<Record<string, unknown>> };

    let syncedCount = 0;

    for (const product of response.products ?? []) {
      await this.upsertProduct(tenantId, product);
      syncedCount += 1;
    }

    await this.touchLastSync(tenantId);

    return { success: true, syncedCount };
  }

  async upsertOrder(tenantId: string, shopifyOrder: Record<string, unknown>) {
    const externalId = this.getNullableString(shopifyOrder.id);

    if (!externalId) {
      throw new BadRequestException('Shopify order id is missing');
    }

    const customer = this.asRecord(shopifyOrder.customer);
    const email =
      this.getNullableString(customer?.email) ??
      this.getNullableString(shopifyOrder.email) ??
      `guest+shopify-${tenantId}-${externalId}@pilot.local`;
    const firstName = this.getNullableString(customer?.first_name);
    const lastName = this.getNullableString(customer?.last_name);
    const financialStatus = this.getString(
      shopifyOrder.financial_status,
      'pending',
    );
    const status = this.mapFinancialStatus(financialStatus);
    const orderNumber =
      this.getString(shopifyOrder.name) ||
      this.getString(shopifyOrder.order_number, externalId);
    const currency = this.getString(shopifyOrder.currency, 'USD');
    const placedAt = this.parseDate(shopifyOrder.created_at);

    const contact = await this.prisma.contact.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: email.trim().toLowerCase(),
        },
      },
      update: {
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        sourceChannel: 'shopify',
      },
      create: {
        tenantId,
        email: email.trim().toLowerCase(),
        firstName,
        lastName,
        sourceChannel: 'shopify',
      },
    });

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
          totalAmount: this.parseDecimal(shopifyOrder.total_price),
          subtotal: this.parseDecimal(shopifyOrder.subtotal_price),
          currency,
          source: 'shopify',
          rawPayload: this.toInputJsonValue(shopifyOrder),
          placedAt,
        },
        create: {
          tenantId,
          contactId: contact.id,
          externalId,
          orderNumber,
          status,
          totalAmount: this.parseDecimal(shopifyOrder.total_price),
          subtotal: this.parseDecimal(shopifyOrder.subtotal_price),
          currency,
          source: 'shopify',
          rawPayload: this.toInputJsonValue(shopifyOrder),
          placedAt,
        },
      });

      await tx.orderItem.deleteMany({ where: { orderId: upsertedOrder.id } });

      const lineItems = this.asRecordArray(shopifyOrder.line_items);
      if (lineItems.length > 0) {
        await tx.orderItem.createMany({
          data: lineItems.map((item, index) => ({
            tenantId,
            orderId: upsertedOrder.id,
            externalId:
              this.getNullableString(item.id) ??
              `${externalId}-item-${index + 1}`,
            productId: null,
            productExternalId: this.getNullableString(item.product_id),
            name: this.getString(item.name, 'Unnamed item'),
            sku: this.getNullableString(item.sku),
            quantity: this.parseInteger(item.quantity, 1),
            unitPrice: this.parseDecimal(item.price),
            totalPrice: this.parseDecimal(item.price),
          })),
          skipDuplicates: true,
        });
      }

      return upsertedOrder;
    });

    await this.recalculateContactMetrics(contact.id);

    return { order, contactId: contact.id, status };
  }

  async upsertProduct(
    tenantId: string,
    shopifyProduct: Record<string, unknown>,
  ) {
    const externalId = this.getNullableString(shopifyProduct.id);

    if (!externalId) {
      throw new BadRequestException('Shopify product id is missing');
    }

    const variants = this.asRecordArray(shopifyProduct.variants);
    const primaryVariant = variants[0] ?? null;
    const image = this.asRecord(shopifyProduct.image);

    return this.prisma.product.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId,
        },
      },
      update: {
        name: this.getString(shopifyProduct.title, 'Unnamed product'),
        sku: this.getNullableString(primaryVariant?.sku),
        price: this.parseDecimal(primaryVariant?.price),
        imageUrl: this.getNullableString(image?.src),
        category: this.getNullableString(shopifyProduct.product_type),
        tags: this.extractTags(shopifyProduct.tags),
        stockQuantity: this.parseNullableInteger(
          primaryVariant?.inventory_quantity,
        ),
        lowStockAlert: undefined,
        trackStock:
          this.getString(primaryVariant?.inventory_policy) !== 'continue',
        isActive: this.getString(shopifyProduct.status, 'active') === 'active',
        rawPayload: this.toInputJsonValue(shopifyProduct),
      },
      create: {
        tenantId,
        externalId,
        name: this.getString(shopifyProduct.title, 'Unnamed product'),
        sku: this.getNullableString(primaryVariant?.sku),
        price: this.parseDecimal(primaryVariant?.price),
        imageUrl: this.getNullableString(image?.src),
        category: this.getNullableString(shopifyProduct.product_type),
        tags: this.extractTags(shopifyProduct.tags),
        stockQuantity: this.parseNullableInteger(
          primaryVariant?.inventory_quantity,
        ),
        trackStock:
          this.getString(primaryVariant?.inventory_policy) !== 'continue',
        isActive: this.getString(shopifyProduct.status, 'active') === 'active',
        rawPayload: this.toInputJsonValue(shopifyProduct),
      },
    });
  }

  mapFinancialStatus(status: string): OrderStatus {
    switch (status) {
      case 'paid':
      case 'partially_paid':
      case 'authorized':
        return OrderStatus.PAID;
      case 'refunded':
      case 'partially_refunded':
        return OrderStatus.REFUNDED;
      case 'voided':
        return OrderStatus.CANCELLED;
      default:
        return OrderStatus.PENDING;
    }
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
        `Shopify 429 - retry in ${retryAfter}s (${retries} remaining)`,
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

  private async getActiveCredentials(tenantId: string) {
    const integration = await this.getIntegration(tenantId);

    if (
      integration.status !== IntegrationStatus.ACTIVE ||
      !integration.credentials
    ) {
      throw new NotFoundException('Integration Shopify active introuvable');
    }

    return this.encryptionService.decryptJson<ShopifyCredentials>(
      integration.credentials,
    );
  }

  private getHeaders(accessToken: string) {
    return {
      'X-Shopify-Access-Token': accessToken,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async touchLastSync(tenantId: string) {
    await this.prisma.integration.update({
      where: {
        tenantId_type: {
          tenantId,
          type: IntegrationType.SHOPIFY,
        },
      },
      data: {
        lastSyncAt: new Date(),
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

  private asRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private asRecordArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as Array<Record<string, unknown>>;
    }

    return value.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
  }

  private getString(value: unknown, fallback = '') {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return fallback;
  }

  private getNullableString(value: unknown) {
    const normalized = this.getString(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parseDate(value: unknown) {
    const candidate = value ? new Date(this.getString(value)) : new Date();
    return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  }

  private parseInteger(value: unknown, fallback: number) {
    const parsed = Number(this.getString(value, String(fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private parseNullableInteger(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(this.getString(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseDecimal(value: unknown) {
    const numeric = Number(this.getString(value, '0'));
    return new Prisma.Decimal(Number.isFinite(numeric) ? numeric : 0);
  }

  private extractTags(value: unknown) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return [] as string[];
    }

    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
