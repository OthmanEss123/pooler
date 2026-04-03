import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createPrismaMock, toCookieHeader } from './support/create-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '123456789012345678901234567890123456789012345678901234567890123434567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

describe('AnalyticsController (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = {
    ...createPrismaMock(),
    order: {
      findMany: jest.fn(),
    },
  };

  const clickhouseMock = {
    query: jest.fn(),
    insert: jest.fn(),
    command: jest.fn(),
    isHealthy: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ClickhouseService)
      .useValue(clickhouseMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    const authResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Analytics Test Corp',
        tenantSlug: 'analytics-test-corp',
        email: 'analytics@example.com',
        password: 'Password123!',
        firstName: 'Ana',
        lastName: 'Lytics',
      })
      .expect(201);

    cookies = toCookieHeader(
      authResponse.headers['set-cookie'] as unknown as string[],
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/analytics/summary -> 401 without token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/summary?from=2026-03-01&to=2026-03-10')
      .expect(401);
  });

  it('GET /api/v1/analytics/summary -> 400 without from/to', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .set('Cookie', cookies)
      .expect(400);
  });

  it('GET /api/v1/analytics/summary -> 200', async () => {
    clickhouseMock.query
      .mockResolvedValueOnce([
        {
          totalRevenue: 1200,
          totalOrders: 15,
          emailRevenue: 320,
        },
      ])
      .mockResolvedValueOnce([{ adsSpend: 400 }])
      .mockResolvedValueOnce([{ currentRevenue: 100 }])
      .mockResolvedValueOnce([{ avgRevenue7d: 200 }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/summary?from=2026-03-01&to=2026-03-10')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual({
      totalRevenue: 1200,
      totalOrders: 15,
      emailRevenue: 320,
      adsSpend: 400,
      blendedRoas: 3,
      mer: 3,
      anomalies: [
        {
          severity: 'MEDIUM',
          message: 'Revenue dropped below 75% of the 7-day average.',
          currentRevenue: 100,
          averageRevenue7d: 200,
          ratio: 0.5,
        },
      ],
    });
    expect(clickhouseMock.query).toHaveBeenCalledTimes(4);
  });

  it('GET /api/v1/analytics/revenue -> 200', async () => {
    clickhouseMock.query.mockResolvedValueOnce([
      { period: '2026-03-01', revenue: 100, orders: 2 },
      { period: '2026-03-02', revenue: 200, orders: 3 },
    ]);

    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/revenue?from=2026-03-01&to=2026-03-10&granularity=day',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual([
      { period: '2026-03-01', revenue: 100, orders: 2 },
      { period: '2026-03-02', revenue: 200, orders: 3 },
    ]);
  });

  it('GET /api/v1/analytics/roas -> 200', async () => {
    clickhouseMock.query.mockResolvedValueOnce([
      { date: '2026-03-01', revenue: 1000, spend: 200 },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/roas?from=2026-03-01&to=2026-03-10')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual([{ date: '2026-03-01', roas: 5, mer: 5 }]);
  });

  it('GET /api/v1/analytics/email-funnel -> 200', async () => {
    clickhouseMock.query.mockResolvedValueOnce([
      { type: 'SENT', count: 100 },
      { type: 'OPENED', count: 60 },
      { type: 'CLICKED', count: 20 },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/email-funnel')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual([
      { type: 'SENT', count: 100 },
      { type: 'OPENED', count: 60 },
      { type: 'CLICKED', count: 20 },
    ]);
  });

  it('POST /api/v1/analytics/ingest/daily -> 201', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      { id: 'order-1', totalAmount: 250 },
      { id: 'order-2', totalAmount: 50 },
    ]);
    clickhouseMock.insert.mockResolvedValueOnce(undefined);

    const response = await request(app.getHttpServer())
      .post('/api/v1/analytics/ingest/daily')
      .set('Cookie', cookies)
      .send({ date: '2026-03-10' })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      message: 'Daily metrics ingested successfully.',
    });
    expect(clickhouseMock.insert).toHaveBeenCalledWith('metrics_daily', [
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        tenant_id: expect.any(String),
        date: '2026-03-10',
        revenue: 300,
        orders: 2,
        email_revenue: 0,
      },
    ]);
  });
});
