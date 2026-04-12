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

describe('GA4 (e2e)', () => {
  let app: INestApplication<Server>;
  const clickhouseInsert = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        integration: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'ga4-integration',
            tenantId: 'tenant-1',
            status: 'ACTIVE',
            credentials: null,
            lastSyncAt: null,
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(ClickhouseService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
        insert: clickhouseInsert,
      })
      .overrideProvider(RedisService)
      .useValue({
        isHealthy: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(QueueHealthService)
      .useValue({
        getStats: jest.fn().mockResolvedValue({
          sync: { waiting: 0, active: 0, failed: 0 },
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

  it('accepts public GA4 ingestion and mirrors aggregate metrics', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/ga4/events/tenant-1')
      .send({
        eventName: 'session_start',
        sessionCount: 1,
        newContacts: 0,
      })
      .expect(200);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.body).toMatchObject({
      success: true,
      tenantId: 'tenant-1',
      received: true,
      eventName: 'session_start',
    });
    expect(clickhouseInsert).toHaveBeenCalledTimes(1);
  });
});
