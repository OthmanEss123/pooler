/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EmailEventType } from '@prisma/client';
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
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

describe('Attribution (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const basePrismaMock = createPrismaMock();
  const prismaMock = {
    ...basePrismaMock,
    order: {
      findMany: jest.fn(),
    },
    emailEvent: {
      findMany: jest.fn(),
    },
    campaign: {
      findMany: jest.fn(),
    },
    contact: {
      ...basePrismaMock.contact,
      findFirst: jest.fn(),
    },
  } as any;

  const clickhouseMock = {
    isHealthy: jest.fn().mockResolvedValue(true),
    query: jest.fn(),
    insert: jest.fn(),
    command: jest.fn(),
    exec: jest.fn(),
  };

  const setBaseAttributionData = () => {
    prismaMock.order.findMany.mockResolvedValue([
      {
        contactId: 'contact-1',
        totalAmount: 120,
        placedAt: new Date('2026-03-08T10:00:00.000Z'),
        contact: {
          sourceChannel: 'google',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      },
      {
        contactId: 'contact-2',
        totalAmount: 80,
        placedAt: new Date('2026-03-09T10:00:00.000Z'),
        contact: {
          sourceChannel: 'organic',
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
        },
      },
      {
        contactId: 'contact-3',
        totalAmount: 50,
        placedAt: new Date('2026-03-10T10:00:00.000Z'),
        contact: {
          sourceChannel: 'organic',
          createdAt: new Date('2026-01-01T10:00:00.000Z'),
        },
      },
    ]);

    prismaMock.emailEvent.findMany.mockResolvedValue([
      {
        campaignId: 'camp-a',
        contactId: 'contact-1',
        type: EmailEventType.CLICKED,
        createdAt: new Date('2026-03-05T08:00:00.000Z'),
      },
      {
        campaignId: 'camp-b',
        contactId: 'contact-1',
        type: EmailEventType.OPENED,
        createdAt: new Date('2026-03-07T09:00:00.000Z'),
      },
      {
        campaignId: 'camp-b',
        contactId: 'contact-2',
        type: EmailEventType.CLICKED,
        createdAt: new Date('2026-03-08T07:00:00.000Z'),
      },
    ]);

    prismaMock.campaign.findMany.mockResolvedValue([
      { id: 'camp-a', name: 'Welcome Promo' },
      { id: 'camp-b', name: 'Spring Drop' },
    ]);

    prismaMock.contact.findFirst.mockResolvedValue({
      id: 'contact-1',
      totalRevenue: 1250,
      totalOrders: 3,
      healthScore: {
        segment: 'CHAMPION',
        predictedLtv: 1800,
      },
    });
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
        tenantName: 'Attribution Test Corp',
        tenantSlug: 'attribution-test-corp',
        email: 'attribution@example.com',
        password: 'Password123!',
        firstName: 'Atri',
        lastName: 'Bution',
      })
      .expect(201);

    cookies = toCookieHeader(authResponse.headers['set-cookie']);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setBaseAttributionData();
    (prismaMock.contact.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'contact-1',
        totalRevenue: 1250,
        totalOrders: 3,
        healthScore: { segment: 'CHAMPION', predictedLtv: 1800 },
      },
      {
        id: 'contact-2',
        totalRevenue: 200,
        totalOrders: 1,
        healthScore: { segment: 'NEW', predictedLtv: 320 },
      },
    ]);
    clickhouseMock.query.mockResolvedValue([{ adsSpend: 240 }]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/analytics/attribution/run -> 401 without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/analytics/attribution/run')
      .send({ from: '2026-03-01', to: '2026-03-10' })
      .expect(401);
  });

  it('GET /api/v1/analytics/attribution -> 200 for last touch', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.model).toBe('last_touch');
    expect(response.body.totalRevenue).toBe(250);
    expect(response.body.campaigns[0]).toEqual(
      expect.objectContaining({
        campaignId: 'camp-b',
        name: 'Spring Drop',
      }),
    );
  });

  it('GET /api/v1/analytics/attribution -> accepts last_click alias', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=last_click',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.model).toBe('last_touch');
    expect(response.body.attributedRevenue).toBeGreaterThan(0);
  });

  it('GET /api/v1/analytics/attribution -> supports linear model', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=linear',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.campaigns.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/analytics/attribution -> supports time_decay model', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=time_decay',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.attributedRevenue).toBeGreaterThan(0);
  });

  it('GET /api/v1/analytics/attribution -> supports position_based model', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=position_based',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.campaigns).toBeDefined();
  });

  it('GET /api/v1/analytics/attribution -> applies emailWindowHours filter', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=last_click&emailWindowHours=1',
      )
      .set('Cookie', cookies)
      .expect(200);

    const campA = response.body.campaigns.find(
      (item: { campaignId: string; attributedRevenue?: number }) =>
        item.campaignId === 'camp-a',
    );

    expect(response.body.unattributedRevenue).toBe(50);
    expect(campA?.attributedRevenue ?? 0).toBe(0);
  });

  it('POST /api/v1/analytics/attribution/run -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/analytics/attribution/run')
      .set('Cookie', cookies)
      .send({ from: '2026-03-01', to: '2026-03-10', model: 'linear' })
      .expect(201);

    expect(response.body).toHaveProperty('campaigns');
  });

  it('GET /api/v1/analytics/cac -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/cac?from=2026-03-01&to=2026-03-10')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toHaveProperty('total');
  });

  it('GET /api/v1/analytics/ltv -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/ltv')
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /api/v1/analytics/ltv/:contactId -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/ltv/contact-1')
      .set('Cookie', cookies)
      .expect(200);

    expect(typeof response.body.ltv).toBe('number');
  });
});
