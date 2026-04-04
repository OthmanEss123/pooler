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

  const prismaMock = {
    ...createPrismaMock(),
    order: {
      findMany: jest.fn(),
    },
    emailEvent: {
      findMany: jest.fn(),
    },
    campaign: {
      findMany: jest.fn(),
    },
  } as any;

  const clickhouseMock = {
    isHealthy: jest.fn().mockResolvedValue(true),
    query: jest.fn(),
    insert: jest.fn(),
    command: jest.fn(),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/analytics/attribution -> 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10')
      .expect(401);
  });

  it('GET /api/v1/analytics/attribution -> 200 for last touch', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      {
        contactId: 'contact-1',
        totalAmount: 120,
        placedAt: new Date('2026-03-08T10:00:00.000Z'),
      },
      {
        contactId: 'contact-2',
        totalAmount: 80,
        placedAt: new Date('2026-03-09T10:00:00.000Z'),
      },
      {
        contactId: 'contact-3',
        totalAmount: 50,
        placedAt: new Date('2026-03-10T10:00:00.000Z'),
      },
    ]);
    prismaMock.emailEvent.findMany.mockResolvedValueOnce([
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
    prismaMock.campaign.findMany.mockResolvedValueOnce([
      { id: 'camp-a', name: 'Welcome Promo' },
      { id: 'camp-b', name: 'Spring Drop' },
    ]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual({
      model: 'last_touch',
      from: '2026-03-01',
      to: '2026-03-10',
      totalRevenue: 250,
      attributedRevenue: 200,
      unattributedRevenue: 50,
      unattributedOrders: 1,
      campaigns: [
        {
          campaignId: 'camp-b',
          name: 'Spring Drop',
          attributedRevenue: 200,
          attributedOrders: 2,
          clicks: 1,
          opens: 1,
          revenueShare: 1,
        },
        {
          campaignId: 'camp-a',
          name: 'Welcome Promo',
          attributedRevenue: 0,
          attributedOrders: 0,
          clicks: 1,
          opens: 0,
          revenueShare: 0,
        },
      ],
    });
  });

  it('GET /api/v1/analytics/attribution -> 200 for first touch', async () => {
    prismaMock.order.findMany.mockResolvedValueOnce([
      {
        contactId: 'contact-1',
        totalAmount: 120,
        placedAt: new Date('2026-03-08T10:00:00.000Z'),
      },
      {
        contactId: 'contact-2',
        totalAmount: 80,
        placedAt: new Date('2026-03-09T10:00:00.000Z'),
      },
      {
        contactId: 'contact-3',
        totalAmount: 50,
        placedAt: new Date('2026-03-10T10:00:00.000Z'),
      },
    ]);
    prismaMock.emailEvent.findMany.mockResolvedValueOnce([
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
    prismaMock.campaign.findMany.mockResolvedValueOnce([
      { id: 'camp-a', name: 'Welcome Promo' },
      { id: 'camp-b', name: 'Spring Drop' },
    ]);

    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/analytics/attribution?from=2026-03-01&to=2026-03-10&model=first_touch',
      )
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body).toEqual({
      model: 'first_touch',
      from: '2026-03-01',
      to: '2026-03-10',
      totalRevenue: 250,
      attributedRevenue: 200,
      unattributedRevenue: 50,
      unattributedOrders: 1,
      campaigns: [
        {
          campaignId: 'camp-a',
          name: 'Welcome Promo',
          attributedRevenue: 120,
          attributedOrders: 1,
          clicks: 1,
          opens: 0,
          revenueShare: 0.6,
        },
        {
          campaignId: 'camp-b',
          name: 'Spring Drop',
          attributedRevenue: 80,
          attributedOrders: 1,
          clicks: 1,
          opens: 1,
          revenueShare: 0.4,
        },
      ],
    });
  });
});
