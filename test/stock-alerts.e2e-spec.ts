/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { StockAlertService } from '../src/modules/copilot/stock-alert.service';
import { InsightsService } from '../src/modules/insights/insights.service';
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

describe('Stock alerts (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock() as any;
  const insightsStore: Array<Record<string, unknown>> = [];

  const insightsServiceMock = {
    findAll: jest.fn((currentTenantId: string, unreadOnly?: boolean) =>
      insightsStore.filter((insight) => {
        if (insight.tenantId !== currentTenantId) {
          return false;
        }

        if (unreadOnly && insight.isRead === true) {
          return false;
        }

        return true;
      }),
    ),
    markAsRead: jest.fn(),
    remove: jest.fn(),
    generateInsights: jest.fn(() => ({ created: 0 })),
  };

  const stockAlertServiceMock = {
    detectLowStock: jest.fn((currentTenantId: string) => {
      const exists = insightsStore.some(
        (insight) =>
          insight.tenantId === currentTenantId &&
          insight.title === 'Stock a surveiller - Produit Hero',
      );

      if (exists) {
        return { created: 0 };
      }

      insightsStore.push({
        id: `stock-insight-${insightsStore.length + 1}`,
        tenantId: currentTenantId,
        type: 'ANOMALY',
        title: 'Stock a surveiller - Produit Hero',
        description: '15 ventes/30j. Dans 1 flow(s) actif(s).',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      return { created: 1 };
    }),
  };

  const owner = {
    tenantName: 'Stock Corp',
    tenantSlug: 'stock-corp',
    email: 'stock-owner@example.com',
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
      .overrideProvider(InsightsService)
      .useValue(insightsServiceMock)
      .overrideProvider(StockAlertService)
      .useValue(stockAlertServiceMock)
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

  it('POST /api/v1/insights/generate -> 200 and creates a stock anomaly once', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/insights/generate')
      .set('Cookie', cookies)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/insights')
      .set('Cookie', cookies)
      .expect(200);
    const insights = response.body as Array<Record<string, unknown>>;

    expect(
      insights.some(
        (insight) =>
          insight.type === 'ANOMALY' &&
          insight.title === 'Stock a surveiller - Produit Hero',
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .post('/api/v1/insights/generate')
      .set('Cookie', cookies)
      .expect(200);

    const secondResponse = await request(app.getHttpServer())
      .get('/api/v1/insights')
      .set('Cookie', cookies)
      .expect(200);
    const nextInsights = secondResponse.body as Array<Record<string, unknown>>;
    const stockAlerts = nextInsights.filter(
      (insight) =>
        insight.tenantId === tenantId &&
        insight.title === 'Stock a surveiller - Produit Hero',
    );

    expect(stockAlerts).toHaveLength(1);
  });
});
