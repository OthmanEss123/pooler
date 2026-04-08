/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { ProductsService } from '../src/modules/products/products.service';
import { createPrismaMock, toCookieHeader } from './support/create-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.NARRATIVE_AGENT_URL = '';

interface MockProduct {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  stockQuantity: number | null;
  lowStockAlert: number | null;
  trackStock: boolean;
  isActive: boolean;
}

interface MockStockInsight {
  id: string;
  tenantId: string;
  type: 'ANOMALY';
  title: string;
  description: string;
  productId: string;
}

describe('Stock tracking (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock() as any;
  const productsStore: MockProduct[] = [];
  const insightsStore: MockStockInsight[] = [];
  let productCounter = 1;

  const createProductForTenant = (
    currentTenantId: string,
    overrides: Partial<MockProduct> = {},
  ): MockProduct => {
    const product: MockProduct = {
      id: `prod-${productCounter++}`,
      tenantId: currentTenantId,
      name: 'Produit Hero',
      sku: 'HERO-001',
      stockQuantity: 50,
      lowStockAlert: 10,
      trackStock: true,
      isActive: true,
      ...overrides,
    };
    productsStore.push(product);
    return product;
  };

  const productsServiceMock = {
    findAll: jest.fn((currentTenantId: string) => {
      const data = productsStore.filter(
        (p) => p.tenantId === currentTenantId && p.isActive,
      );
      return { data, total: data.length, limit: 50, offset: 0 };
    }),

    findOne: jest.fn((currentTenantId: string, id: string) => {
      const found = productsStore.find(
        (p) => p.id === id && p.tenantId === currentTenantId && p.isActive,
      );
      if (!found) {
        const error = new Error('Produit introuvable') as Error & {
          status?: number;
        };
        error.status = 404;
        throw error;
      }
      return found;
    }),

    findLowStock: jest.fn((currentTenantId: string) =>
      productsStore.filter(
        (p) =>
          p.tenantId === currentTenantId &&
          p.isActive &&
          p.trackStock &&
          p.stockQuantity !== null &&
          p.lowStockAlert !== null &&
          p.stockQuantity <= p.lowStockAlert,
      ),
    ),

    updateStock: jest.fn(
      (
        currentTenantId: string,
        id: string,
        dto: {
          stockQuantity?: number;
          lowStockAlert?: number;
          trackStock?: boolean;
        },
      ) => {
        const product = productsStore.find(
          (p) => p.id === id && p.tenantId === currentTenantId,
        );
        if (!product) {
          const error = new Error('Produit introuvable') as Error & {
            status?: number;
          };
          error.status = 404;
          throw error;
        }

        if (dto.stockQuantity !== undefined) {
          product.stockQuantity = dto.stockQuantity;
        }
        if (dto.lowStockAlert !== undefined) {
          product.lowStockAlert = dto.lowStockAlert;
        }
        if (dto.trackStock !== undefined) {
          product.trackStock = dto.trackStock;
        }

        if (
          product.trackStock &&
          product.stockQuantity !== null &&
          product.lowStockAlert !== null &&
          product.stockQuantity <= product.lowStockAlert
        ) {
          const alreadyExists = insightsStore.some(
            (insight) =>
              insight.tenantId === currentTenantId &&
              insight.productId === product.id,
          );
          if (!alreadyExists) {
            insightsStore.push({
              id: `insight-${insightsStore.length + 1}`,
              tenantId: currentTenantId,
              type: 'ANOMALY',
              title: `Stock faible - ${product.name}`,
              description: `Stock ${product.stockQuantity} <= seuil ${product.lowStockAlert}`,
              productId: product.id,
            });
          }
        }

        return product;
      },
    ),

    decrementStock: jest.fn(
      (currentTenantId: string, productId: string, quantity: number) => {
        const product = productsStore.find(
          (p) => p.id === productId && p.tenantId === currentTenantId,
        );
        if (!product || !product.trackStock) {
          return product;
        }

        product.stockQuantity = Math.max(
          (product.stockQuantity ?? 0) - quantity,
          0,
        );

        if (
          product.lowStockAlert !== null &&
          product.stockQuantity <= product.lowStockAlert
        ) {
          const alreadyExists = insightsStore.some(
            (insight) =>
              insight.tenantId === currentTenantId &&
              insight.productId === product.id,
          );
          if (!alreadyExists) {
            insightsStore.push({
              id: `insight-${insightsStore.length + 1}`,
              tenantId: currentTenantId,
              type: 'ANOMALY',
              title: `Stock faible - ${product.name}`,
              description: `Stock ${product.stockQuantity} <= seuil ${product.lowStockAlert}`,
              productId: product.id,
            });
          }
        }

        return product;
      },
    ),

    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    upsertByExternalId: jest.fn(),
  };

  const owner = {
    tenantName: 'Stock Tracking Corp',
    tenantSlug: 'stock-tracking-corp',
    email: 'stock-tracking-owner@example.com',
    password: 'Password123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ClickhouseService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(ProductsService)
      .useValue(productsServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    tenantId = registerResponse.body.user.tenantId as string;
    cookies = toCookieHeader(registerResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    productsStore.length = 0;
    insightsStore.length = 0;
    productCounter = 1;
    productsServiceMock.findOne.mockClear();
    productsServiceMock.findLowStock.mockClear();
    productsServiceMock.updateStock.mockClear();
    productsServiceMock.decrementStock.mockClear();
  });

  describe('PATCH /products/:id/stock', () => {
    it('200 - met a jour stockQuantity et lowStockAlert', async () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 100,
        lowStockAlert: 5,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}/stock`)
        .set('Cookie', cookies)
        .send({ stockQuantity: 42, lowStockAlert: 12 })
        .expect(200);

      expect(response.body.stockQuantity).toBe(42);
      expect(response.body.lowStockAlert).toBe(12);
      expect(productsServiceMock.updateStock).toHaveBeenCalledWith(
        tenantId,
        product.id,
        expect.objectContaining({ stockQuantity: 42, lowStockAlert: 12 }),
      );
    });

    it('200 - cree une anomalie quand le stock passe sous le seuil', async () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 50,
        lowStockAlert: 10,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}/stock`)
        .set('Cookie', cookies)
        .send({ stockQuantity: 8 })
        .expect(200);

      const stockInsights = insightsStore.filter(
        (insight) =>
          insight.tenantId === tenantId && insight.productId === product.id,
      );
      expect(stockInsights).toHaveLength(1);
      expect(stockInsights[0]?.type).toBe('ANOMALY');
      expect(stockInsights[0]?.title).toContain('Stock faible');
    });

    it('200 - ne cree pas de doublon si une anomalie existe deja', async () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 5,
        lowStockAlert: 10,
      });

      // Premier passage : cree l'insight
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}/stock`)
        .set('Cookie', cookies)
        .send({ stockQuantity: 4 })
        .expect(200);

      // Second passage : ne doit pas en creer un autre
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}/stock`)
        .set('Cookie', cookies)
        .send({ stockQuantity: 3 })
        .expect(200);

      const stockInsights = insightsStore.filter(
        (insight) =>
          insight.tenantId === tenantId && insight.productId === product.id,
      );
      expect(stockInsights).toHaveLength(1);
    });

    it('401 - sans cookie', async () => {
      const product = createProductForTenant(tenantId);
      await request(app.getHttpServer())
        .patch(`/api/v1/products/${product.id}/stock`)
        .send({ stockQuantity: 10 })
        .expect(401);
    });
  });

  describe('GET /products/low-stock', () => {
    it('200 - retourne uniquement les produits en stock faible', async () => {
      createProductForTenant(tenantId, {
        name: 'Produit OK',
        stockQuantity: 100,
        lowStockAlert: 10,
      });
      const lowStockProduct = createProductForTenant(tenantId, {
        name: 'Produit Faible',
        stockQuantity: 3,
        lowStockAlert: 10,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/products/low-stock')
        .set('Cookie', cookies)
        .expect(200);

      const body = response.body as Array<Record<string, unknown>>;
      expect(body).toHaveLength(1);
      expect(body[0]?.id).toBe(lowStockProduct.id);
      expect(productsServiceMock.findLowStock).toHaveBeenCalledWith(tenantId);
    });

    it('200 - exclut les produits avec trackStock=false', async () => {
      createProductForTenant(tenantId, {
        name: 'Stock non suivi',
        stockQuantity: 1,
        lowStockAlert: 10,
        trackStock: false,
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/products/low-stock')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('401 - sans cookie', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/products/low-stock')
        .expect(401);
    });
  });

  describe('Auto-decrement apres commande', () => {
    it('decremente le stock et cree une anomalie quand le seuil est atteint', () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 12,
        lowStockAlert: 10,
      });

      productsServiceMock.decrementStock(tenantId, product.id, 3);

      const updated = productsStore.find((p) => p.id === product.id);
      expect(updated?.stockQuantity).toBe(9);

      const stockInsights = insightsStore.filter(
        (insight) =>
          insight.tenantId === tenantId && insight.productId === product.id,
      );
      expect(stockInsights).toHaveLength(1);
    });

    it('ne decremente pas en dessous de zero', () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 2,
        lowStockAlert: 10,
      });

      productsServiceMock.decrementStock(tenantId, product.id, 50);

      const updated = productsStore.find((p) => p.id === product.id);
      expect(updated?.stockQuantity).toBe(0);
    });

    it('ne touche pas au stock si trackStock = false', () => {
      const product = createProductForTenant(tenantId, {
        stockQuantity: 100,
        lowStockAlert: 10,
        trackStock: false,
      });

      productsServiceMock.decrementStock(tenantId, product.id, 5);

      const updated = productsStore.find((p) => p.id === product.id);
      expect(updated?.stockQuantity).toBe(100);
    });
  });
});
