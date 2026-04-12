/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { CopilotService } from '../src/modules/copilot/copilot.service';
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

describe('Copilot (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = createPrismaMock() as any;

  const copilotServiceMock = {
    getRecommendations: jest.fn(() => [
      {
        id: 'insight-1',
        type: 'AD_WASTE',
        title: 'Budget ads a surveiller',
        action: 'Revoir les campagnes avec le ROAS le plus faible.',
        priority: 'HIGH',
        impact: 250,
        createdAt: new Date().toISOString(),
      },
    ]),
    ask: jest.fn((_tenantId: string, question: string) => ({
      answer: `Service temporairement indisponible. Question recue: ${question}`,
      reasoning: 'Fallback local.',
      actions: [],
    })),
  };

  const owner = {
    tenantName: 'Copilot Corp',
    tenantSlug: 'copilot-corp',
    email: 'copilot-owner@example.com',
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
      .overrideProvider(CopilotService)
      .useValue(copilotServiceMock)
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

    cookies = toCookieHeader(registerResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/copilot/recommendations -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/copilot/recommendations')
      .expect(401);
  });

  it('GET /api/v1/copilot/recommendations -> 200 actionable list', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/copilot/recommendations')
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toMatchObject({
      type: 'AD_WASTE',
      action: 'Revoir les campagnes avec le ROAS le plus faible.',
      priority: 'HIGH',
    });
  });

  it('POST /api/v1/copilot/ask -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/copilot/ask')
      .send({ question: 'Ameliorer mes ventes ?' })
      .expect(401);
  });

  it('POST /api/v1/copilot/ask -> 200 answer string', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/copilot/ask')
      .set('Cookie', cookies)
      .send({ question: 'Ameliorer mes ventes ?' })
      .expect(200);

    expect(typeof response.body.answer).toBe('string');
    expect(typeof response.body.reasoning).toBe('string');
  });

  it('POST /api/v1/copilot/ask -> 400 if question too short', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/copilot/ask')
      .set('Cookie', cookies)
      .send({ question: 'ab' })
      .expect(400);
  });
});
