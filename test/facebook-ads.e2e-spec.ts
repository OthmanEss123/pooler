/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { FacebookAdsApiClient } from '../src/modules/integrations/facebook-ads/facebook-ads-api.client';
import { QueueHealthService } from '../src/queue/queue-health.service';
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
process.env.ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.FACEBOOK_APP_ID ??= 'fb-test-app-id';
process.env.FACEBOOK_APP_SECRET ??= 'fb-test-app-secret';
process.env.FACEBOOK_REDIRECT_URI ??=
  'http://localhost:3000/api/v1/integrations/facebook-ads/oauth/callback';

describe('Facebook Ads (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock();
  const clickhouseCommand = jest.fn().mockResolvedValue(undefined);
  const clickhouseInsert = jest.fn().mockResolvedValue(undefined);

  const graphClientMock = {
    exchangeCodeForShortToken: jest
      .fn()
      .mockResolvedValue({ access_token: 'short-token-exchange' }),
    getLongLivedToken: jest
      .fn()
      .mockResolvedValue({ access_token: 'long-lived-token-for-connect' }),
    get: jest.fn(),
    post: jest.fn().mockResolvedValue({ id: 'fb-custom-audience-1' }),
    getAllPages: jest.fn().mockResolvedValue([]),
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
        command: clickhouseCommand,
        insert: clickhouseInsert,
      })
      .overrideProvider(FacebookAdsApiClient)
      .useValue(graphClientMock)
      .overrideProvider(QueueHealthService)
      .useValue({
        getStats: jest.fn().mockResolvedValue({
          campaign: { waiting: 0, active: 0, failed: 0 },
          email: { waiting: 0, active: 0, failed: 0 },
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

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Facebook Ads Test Corp',
        tenantSlug: 'facebook-ads-test-corp',
        email: 'facebook-ads-owner@example.com',
        password: 'Password123!',
        firstName: 'FB',
        lastName: 'Owner',
      })
      .expect(201);

    ownerCookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );
    tenantId = registerResponse.body.user.tenantId as string;
  });

  afterEach(() => {
    jest.clearAllMocks();
    graphClientMock.exchangeCodeForShortToken.mockResolvedValue({
      access_token: 'short-token-exchange',
    });
    graphClientMock.getLongLivedToken.mockResolvedValue({
      access_token: 'long-lived-token-for-connect',
    });
    graphClientMock.getAllPages.mockResolvedValue([]);
    graphClientMock.post.mockResolvedValue({ id: 'fb-custom-audience-1' });
    clickhouseCommand.mockResolvedValue(undefined);
    clickhouseInsert.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST sync/campaigns returns 404 when Facebook Ads is not connected', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/sync/campaigns')
      .set('Cookie', ownerCookies)
      .expect(404);
  });

  it('GET oauth/url returns 400 without tenantId', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/url')
      .expect(400);
  });

  it('GET oauth/url returns a Facebook dialog URL with state', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/url')
      .query({ tenantId })
      .expect(200);

    expect(response.body.url).toContain('facebook.com');
    expect(response.body.url).toContain('client_id=');
    const parsed = new URL(response.body.url as string);
    expect(parsed.searchParams.get('state')).toEqual(
      expect.stringMatching(/^[a-f0-9]{32}$/),
    );
  });

  it('GET oauth/callback returns 400 without code', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/callback')
      .query({ state: 'abcd' })
      .expect(400);
  });

  it('GET oauth/callback returns 400 for unknown state', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/callback')
      .query({ code: 'fake-code', state: '00' + 'ff'.repeat(16) })
      .expect(400);
  });

  it('GET oauth/callback exchanges code and returns tenantId + tempToken', async () => {
    const urlRes = await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/url')
      .query({ tenantId })
      .expect(200);

    const authUrl = new URL(urlRes.body.url as string);
    const state = authUrl.searchParams.get('state');
    expect(state).toBeTruthy();

    const cb = await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/oauth/callback')
      .query({ code: 'auth-code-from-facebook', state })
      .expect(200);

    expect(cb.body).toMatchObject({
      tenantId,
      tempToken: 'long-lived-token-for-connect',
    });
    expect(graphClientMock.exchangeCodeForShortToken).toHaveBeenCalled();
    expect(graphClientMock.getLongLivedToken).toHaveBeenCalled();
  });

  it('POST connect returns 401 without auth cookies', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/connect')
      .send({
        tempToken: 'long-lived-token-for-connect',
        adAccountId: 'act_123456789',
      })
      .expect(401);
  });

  it('POST connect persists integration and GET campaigns lists synced rows', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/connect')
      .set('Cookie', ownerCookies)
      .send({
        tempToken: 'long-lived-token-for-connect',
        adAccountId: 'act_123456789',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.integrationId).toEqual(expect.any(String));
      });

    graphClientMock.getAllPages.mockResolvedValueOnce([
      {
        id: '777',
        name: 'Test Campaign',
        status: 'ACTIVE',
        daily_budget: 10_000,
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/sync/campaigns')
      .set('Cookie', ownerCookies)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.syncedCount).toBe(1);
      });

    const list = await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/campaigns')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: '777',
          name: 'Test Campaign',
        }),
      ]),
    );
  });

  it('POST sync/metrics writes ClickHouse rows when insights exist', async () => {
    graphClientMock.getAllPages.mockResolvedValueOnce([
      {
        campaign_id: '777',
        campaign_name: 'Test Campaign',
        spend: '12.34',
        impressions: '1000',
        clicks: '50',
        actions: [],
        action_values: [],
        date_start: '2026-04-01',
      },
    ]);

    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/sync/metrics')
      .set('Cookie', ownerCookies)
      .send({ dateFrom: '2026-04-01', dateTo: '2026-04-02' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.syncedCount).toBe(1);
      });

    expect(clickhouseCommand).toHaveBeenCalled();
    expect(clickhouseInsert).toHaveBeenCalledWith(
      'ad_metrics_daily',
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: tenantId,
          campaign_id: '777',
          date: '2026-04-01',
        }),
      ]),
    );
  });

  it('POST audiences/sync returns 404 for unknown segment', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/facebook-ads/audiences/sync')
      .set('Cookie', ownerCookies)
      .send({ segmentId: 'segment-nonexistent' })
      .expect(404);
  });

  it('GET campaigns returns 401 without cookies', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/facebook-ads/campaigns')
      .expect(401);
  });
});
