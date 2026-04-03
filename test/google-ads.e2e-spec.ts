/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { GoogleAdsService } from '../src/modules/integrations/google-ads/google-ads.service';
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

describe('Google Ads (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock();
  const googleAdsServiceMock = {
    getOAuthUrl: jest.fn((currentTenantId: string) => ({
      url: `https://accounts.google.com/o/oauth2/v2/auth?state=${currentTenantId}`,
    })),
    handleOAuthCallback: jest.fn((state: string, code?: string) => {
      if (!code) {
        throw new BadRequestException('Code OAuth manquant');
      }

      return {
        success: true,
        tenantId: state,
        refreshToken: 'refresh-token-test',
      };
    }),
    connect: jest.fn().mockResolvedValue({
      success: true,
      integrationId: 'integration-1',
      status: 'ACTIVE',
    }),
    disconnect: jest.fn().mockResolvedValue({
      success: true,
      integrationId: 'integration-1',
      status: 'DISCONNECTED',
    }),
    syncCampaigns: jest.fn().mockResolvedValue({
      success: true,
      syncedCount: 2,
    }),
    syncMetrics: jest.fn().mockResolvedValue({
      success: true,
      syncedCount: 10,
      dateFrom: '2026-03-20',
      dateTo: '2026-03-27',
    }),
    listCampaigns: jest.fn().mockResolvedValue([
      {
        id: 'camp_1',
        name: 'Campaign 1',
      },
    ]),
    getCampaignById: jest.fn().mockResolvedValue({
      id: 'camp_1',
      name: 'Campaign 1',
    }),
    syncAudienceFromSegment: jest.fn().mockResolvedValue({
      success: true,
      audienceId: 'aud_1',
      emailCount: 42,
    }),
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
      .overrideProvider(GoogleAdsService)
      .useValue(googleAdsServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
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

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Google Ads Test Corp',
        tenantSlug: 'google-ads-test-corp',
        email: 'google-ads-owner@example.com',
        password: 'Password123!',
        firstName: 'Google',
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/integrations/google-ads/oauth/url -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/google-ads/oauth/url')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.url).toContain('accounts.google.com');
    expect(googleAdsServiceMock.getOAuthUrl).toHaveBeenCalledWith(tenantId);
  });

  it('GET /api/v1/integrations/google-ads/oauth/callback -> 400 without code', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/integrations/google-ads/oauth/callback?state=${tenantId}`)
      .expect(400);
  });

  it('POST /api/v1/integrations/google-ads/connect -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/google-ads/connect')
      .set('Cookie', ownerCookies)
      .send({
        refreshToken: 'refresh-token-test',
        customerId: '1234567890',
      })
      .expect(200);

    expect(response.body.status).toBe('ACTIVE');
    expect(googleAdsServiceMock.connect).toHaveBeenCalledWith(
      tenantId,
      'refresh-token-test',
      '1234567890',
    );
  });

  it('POST /api/v1/integrations/google-ads/sync/campaigns -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/google-ads/sync/campaigns')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toEqual({ success: true, syncedCount: 2 });
    expect(googleAdsServiceMock.syncCampaigns).toHaveBeenCalledWith(tenantId);
  });

  it('GET /api/v1/integrations/google-ads/campaigns -> 401 without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/integrations/google-ads/campaigns')
      .expect(401);
  });

  it('GET /api/v1/integrations/google-ads/campaigns -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/google-ads/campaigns')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toEqual([{ id: 'camp_1', name: 'Campaign 1' }]);
    expect(googleAdsServiceMock.listCampaigns).toHaveBeenCalledWith(tenantId);
  });

  it('GET /api/v1/integrations/google-ads/campaigns/:id -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/google-ads/campaigns/camp_1')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.id).toBe('camp_1');
    expect(googleAdsServiceMock.getCampaignById).toHaveBeenCalledWith(
      tenantId,
      'camp_1',
    );
  });

  it('POST /api/v1/integrations/google-ads/sync/metrics -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/google-ads/sync/metrics')
      .set('Cookie', ownerCookies)
      .send({
        dateFrom: '2026-03-20',
        dateTo: '2026-03-27',
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      syncedCount: 10,
      dateFrom: '2026-03-20',
      dateTo: '2026-03-27',
    });
    expect(googleAdsServiceMock.syncMetrics).toHaveBeenCalledWith(
      tenantId,
      '2026-03-20',
      '2026-03-27',
    );
  });

  it('POST /api/v1/integrations/google-ads/audiences/sync -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/google-ads/audiences/sync')
      .set('Cookie', ownerCookies)
      .send({
        segmentId: 'segment-1',
        audienceName: 'VIP Audience',
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      audienceId: 'aud_1',
      emailCount: 42,
    });
    expect(googleAdsServiceMock.syncAudienceFromSegment).toHaveBeenCalledWith(
      tenantId,
      'segment-1',
      'VIP Audience',
    );
  });

  it('POST /api/v1/integrations/google-ads/disconnect -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/google-ads/disconnect')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.status).toBe('DISCONNECTED');
    expect(googleAdsServiceMock.disconnect).toHaveBeenCalledWith(tenantId);
  });
});
