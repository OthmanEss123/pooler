import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { QueueHealthService } from '../src/queue/queue-health.service';
import { RedisService } from '../src/redis/redis.service';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.METRICS_TOKEN ??= 'test-metrics-token-1234';

describe('Security and metrics (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        tenant: { count: jest.fn().mockResolvedValue(3) },
        contact: { count: jest.fn().mockResolvedValue(42) },
        order: { count: jest.fn().mockResolvedValue(19) },
        product: { count: jest.fn().mockResolvedValue(12) },
        insight: { count: jest.fn().mockResolvedValue(9) },
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(ClickhouseService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(RedisService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(QueueHealthService)
      .useValue({
        getStats: jest.fn().mockResolvedValue({
          sync: { waiting: 6, active: 2, failed: 8 },
        }),
      })
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects metrics requests with an invalid token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('x-metrics-token', 'wrong-token')
      .expect(403);
  });

  it('returns metrics and request id for a valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/metrics')
      .set('x-metrics-token', process.env.METRICS_TOKEN as string)
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      tenantsActive: 3,
      contactsTotal: 42,
      ordersPaid30d: 19,
      productsActive: 12,
      insightsUnread: 9,
      jobsWaiting: 6,
      jobsActive: 2,
      jobsFailed: 8,
    });
  });
});
