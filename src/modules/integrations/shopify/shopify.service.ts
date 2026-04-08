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
import { OrdersService } from '../../orders/orders.service';

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
    private readonly ordersService: OrdersService,
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
    const fallbackEmail = this.getNullableString(shopifyOrder.email);
    const contact = await this.findOrCreateContact(
      tenantId,
      customer,
      externalId,
      fallbackEmail,
    );
    const financialStatus = this.getString(
      shopifyOrder.financial_status,
      'pending',
    );
    const status = this.mapFinancialStatus(financialStatus);
    const orderNumber =
      this.getString(shopifyOrder.name) ||
      this.getString(shopifyOrder.order_number, externalId);
    const currency = this.getString(shopifyOrder.currency, 'USD');
    const lineItems = this.asRecordArray(shopifyOrder.line_items);

    return this.ordersService.upsertExternalOrder(tenantId, {
      contactEmail: contact.email,
      externalId,
      orderNumber,
      status,
      totalAmount: Number(
        this.parseDecimal(shopifyOrder.total_price).toString(),
      ),
      subtotal: Number(
        this.parseDecimal(shopifyOrder.subtotal_price).toString(),
      ),
      currency,
      source: 'shopify',
      rawPayload: this.toInputJsonValue(shopifyOrder),
      placedAt: this.parseDate(shopifyOrder.created_at).toISOString(),
      emitFlows: false,
      items: await Promise.all(
        lineItems.map(async (item) => {
          const quantity = this.parseInteger(item.quantity, 1);
          const unitPrice = Number(this.parseDecimal(item.price).toString());

          return {
            productId: await this.resolveProductId(tenantId, item),
            productExternalId: this.getNullableString(item.product_id),
            sku: this.getNullableString(item.sku),
            name: this.getString(item.name, 'Unnamed item'),
            quantity,
            unitPrice,
            totalPrice:
              Number(
                this.parseDecimal(item.line_price ?? item.price).toString(),
              ) || unitPrice * quantity,
          };
        }),
      ),
    });
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

  private async findOrCreateContact(
    tenantId: string,
    customer: Record<string, unknown> | null,
    orderExternalId: string,
    fallbackEmail: string | null = null,
  ) {
    const email =
      this.getNullableString(customer?.email) ??
      fallbackEmail ??
      `guest+shopify-${tenantId}-${orderExternalId}@pilot.local`;
    const firstName = this.getNullableString(customer?.first_name);
    const lastName = this.getNullableString(customer?.last_name);

    return this.prisma.contact.upsert({
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
  }

  private async resolveProductId(
    tenantId: string,
    item: Record<string, unknown>,
  ): Promise<string | null> {
    const externalId = this.getNullableString(item.product_id);

    if (!externalId) {
      return null;
    }

    const product = await this.prisma.product.findFirst({
      where: {
        tenantId,
        externalId,
        isActive: true,
      },
      select: { id: true },
    });

    return product?.id ?? null;
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
