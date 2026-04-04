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

describe('Copilot (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = createPrismaMock() as any;
  const insightsStore: Array<Record<string, unknown>> = [];

  const insightsServiceMock = {
    findAll: jest.fn((tenantId: string, unreadOnly?: boolean) =>
      insightsStore.filter((item) => {
        if (item.tenantId !== tenantId) {
          return false;
        }

        if (unreadOnly && item.isRead === true) {
          return false;
        }

        return true;
      }),
    ),
    markAsRead: jest.fn(),
    remove: jest.fn(),
    generateInsights: jest.fn((tenantId: string) => {
      if (insightsStore.length === 0) {
        insightsStore.push({
          id: 'insight-1',
          tenantId,
          type: 'AD_WASTE',
          title: 'Budget ads a surveiller',
          impact: 250,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      return { created: 1 };
    }),
  };

  const stockAlertServiceMock = {
    detectLowStock: jest.fn(() => ({ created: 0 })),
  };

  const copilotServiceMock = {
    getRecommendations: jest.fn(() =>
      insightsStore.map((insight) => ({
        id: insight.id,
        type: insight.type,
        title: insight.title,
        action: 'Pauser la campagne ads',
        priority: 'HIGH',
        impact: insight.impact,
        createdAt: insight.createdAt,
      })),
    ),
    ask: jest.fn((_tenantId: string, question: string) => ({
      answer: `Service temporairement indisponible. Question recue: ${question}`,
      reasoning: '',
      actions: [],
    })),
    suggestCampaign: jest.fn((_tenantId: string, goal: string) => ({
      subjectSuggestions: [
        `${goal} - offre exclusive cette semaine`,
        'Relance intelligente pour votre audience',
        'Derniere chance avant la fin de semaine',
      ],
      bodyHints: ['Mettre un CTA clair'],
      recommendedSegment: 'AT_RISK',
      bestSendTime: 'mardi 10h',
      estimatedOpenRate: '18-22%',
      estimatedRevenue: 420,
      reasoning: 'Fallback local.',
    })),
    getNarrative: jest.fn(() => ({
      narrative: 'Narrative mock du matin',
      generatedAt: new Date().toISOString(),
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
      .overrideProvider(InsightsService)
      .useValue(insightsServiceMock)
      .overrideProvider(StockAlertService)
      .useValue(stockAlertServiceMock)
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
    await request(app.getHttpServer())
      .post('/api/v1/insights/generate')
      .set('Cookie', cookies)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/api/v1/copilot/recommendations')
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toMatchObject({
      type: 'AD_WASTE',
      action: 'Pauser la campagne ads',
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
  });

  it('POST /api/v1/copilot/ask -> 400 if question too short', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/copilot/ask')
      .set('Cookie', cookies)
      .send({ question: 'ab' })
      .expect(400);
  });

  it('POST /api/v1/copilot/campaign-suggest -> 200 suggestion payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/copilot/campaign-suggest')
      .set('Cookie', cookies)
      .send({ goal: 'Re-engager les inactifs' })
      .expect(200);

    expect(response.body.subjectSuggestions.length).toBeGreaterThanOrEqual(1);
    expect(typeof response.body.recommendedSegment).toBe('string');
  });

  it('POST /api/v1/copilot/campaign-suggest -> 400 if goal is empty', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/copilot/campaign-suggest')
      .set('Cookie', cookies)
      .send({ goal: '' })
      .expect(400);
  });

  it('GET /api/v1/copilot/narrative -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/copilot/narrative')
      .set('Cookie', cookies)
      .expect(200);

    expect(typeof response.body.narrative).toBe('string');
    expect(typeof response.body.generatedAt).toBe('string');
  });

  it('GET /api/v1/copilot/narrative -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/copilot/narrative')
      .expect(401);
  });
});
