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

interface HealthResponse {
  status: string;
  timestamp: string;
  services: {
    prisma: string;
    clickhouse: string;
    redis: string;
  };
  queues: {
    sync: {
      waiting: number;
      active: number;
      failed: number;
    };
  };
}

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

describe('Health (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
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

  it('GET /api/v1/health -> 200 with request id header', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect('Content-Type', /json/);

    const body = response.body as HealthResponse;

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    expect(body.services).toHaveProperty('prisma', 'connected');
    expect(body.services).toHaveProperty('clickhouse', 'connected');
    expect(body.services).toHaveProperty('redis', 'connected');
    expect(body.queues.sync.waiting).toBe(0);
    expect(body.queues.sync.failed).toBe(0);
  });

  it('GET /api/v1/unknown -> 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
  });
});
