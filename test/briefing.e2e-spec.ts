/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcrypt';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { BriefingService } from '../src/modules/copilot/briefing.service';
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

describe('Briefing (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let memberCookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock() as any;
  const createUser = prismaMock.user.create as (args: {
    data: {
      tenantId: string;
      email: string;
      passwordHash: string;
      role: string;
    };
  }) => Promise<{ id: string }>;
  const createMembership = prismaMock.membership.create as (args: {
    data: {
      tenantId: string;
      userId: string;
      role: string;
    };
  }) => Promise<unknown>;
  const briefingCache = new Map<string, Record<string, unknown>>();
  let generationCounter = 0;

  const buildBriefing = (tenant: string) => {
    generationCounter += 1;
    const generatedAt = new Date(Date.now() + generationCounter).toISOString();

    return {
      generatedAt,
      period: {
        date: generatedAt.slice(0, 10),
        yesterdayFrom: `${generatedAt.slice(0, 10)}T00:00:00.000Z`,
        yesterdayTo: `${generatedAt.slice(0, 10)}T23:59:59.999Z`,
        todayFrom: `${generatedAt.slice(0, 10)}T00:00:00.000Z`,
        todayTo: generatedAt,
      },
      yesterday: {
        revenue: 1240,
        orders: 18,
        emailRevenue: 420,
        adsSpend: 180,
      },
      today: {
        revenueToDate: 245,
        ordersToDate: 4,
      },
      insights: [
        {
          type: 'ANOMALY',
          title: 'Revenue a surveiller',
          description: 'Le rythme du matin est plus lent que prevu.',
        },
      ],
      healthScores: {
        CHAMPION: 4,
        LOYAL: 8,
        POTENTIAL: 5,
        NEW: 3,
        AT_RISK: 2,
        CANT_LOSE: 1,
        LOST: 1,
      },
      topCampaigns: [
        {
          name: 'Winback Avril',
          openRate: 24.5,
          revenue: 860,
        },
      ],
      forecast: {
        total30d: 5400,
        trend: 'up',
        confidence: 0.82,
      },
      narrative: `Briefing mock pour ${tenant}`,
    };
  };

  const briefingServiceMock = {
    getBriefing: jest.fn((tenant: string) => {
      const cached = briefingCache.get(tenant);
      if (cached) {
        return cached;
      }

      const briefing = buildBriefing(tenant);
      briefingCache.set(tenant, briefing);
      return briefing;
    }),
    refreshBriefing: jest.fn((tenant: string) => {
      briefingCache.delete(tenant);
      const briefing = buildBriefing(tenant);
      briefingCache.set(tenant, briefing);
      return briefing;
    }),
  };

  const owner = {
    tenantName: 'Briefing Corp',
    tenantSlug: 'briefing-corp',
    email: 'briefing-owner@example.com',
    password: 'Password123!',
  };

  const member = {
    email: 'briefing-member@example.com',
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
      .overrideProvider(BriefingService)
      .useValue(briefingServiceMock)
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
    ownerCookies = toCookieHeader(registerResponse.headers['set-cookie']);

    const passwordHash = await hash(member.password, 10);
    const memberUser = await createUser({
      data: {
        tenantId,
        email: member.email,
        passwordHash,
        role: 'MEMBER',
      },
    });

    await createMembership({
      data: {
        tenantId,
        userId: memberUser.id,
        role: 'MEMBER',
      },
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(member)
      .expect(200);

    memberCookies = toCookieHeader(loginResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/copilot/briefing -> 401 sans token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/copilot/briefing')
      .expect(401);
  });

  it('GET /api/v1/copilot/briefing -> 200 structure complete', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/copilot/briefing')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(typeof response.body.generatedAt).toBe('string');
    expect(response.body.yesterday.revenue).toBe(1240);
    expect(Array.isArray(response.body.insights)).toBe(true);
    expect(response.body.narrative).toContain('Briefing mock');
  });

  it('reuses the cached payload on the second call', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/copilot/briefing')
      .set('Cookie', ownerCookies)
      .expect(200);

    const startedAt = Date.now();
    const second = await request(app.getHttpServer())
      .get('/api/v1/copilot/briefing')
      .set('Cookie', ownerCookies)
      .expect(200);
    const durationMs = Date.now() - startedAt;

    expect(second.body.generatedAt).toBe(first.body.generatedAt);
    expect(durationMs).toBeLessThan(100);
  });

  it('POST /api/v1/copilot/briefing/refresh -> 200 with a newer generatedAt for OWNER', async () => {
    const beforeRefresh = await request(app.getHttpServer())
      .get('/api/v1/copilot/briefing')
      .set('Cookie', ownerCookies)
      .expect(200);

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/copilot/briefing/refresh')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(refreshed.body.generatedAt).not.toBe(beforeRefresh.body.generatedAt);
  });

  it('POST /api/v1/copilot/briefing/refresh -> 403 for MEMBER', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/copilot/briefing/refresh')
      .set('Cookie', memberCookies)
      .expect(403);
  });
});
