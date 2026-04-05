/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  INestApplication,
  NotFoundException,
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

describe('Google Ads Write Actions (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock();
  const googleAdsServiceMock = {
    pauseCampaign: jest.fn((currentTenantId: string, id: string) => {
      if (id === 'unknown') {
        throw new NotFoundException('Campagne introuvable');
      }

      return {
        success: true,
        id,
        tenantId: currentTenantId,
        status: 'PAUSED',
      };
    }),
    enableCampaign: jest.fn((currentTenantId: string, id: string) => ({
      success: true,
      id,
      tenantId: currentTenantId,
      status: 'ENABLED',
    })),
    updateBudget: jest.fn(
      (currentTenantId: string, id: string, budgetMicros: number) => ({
        success: true,
        id,
        tenantId: currentTenantId,
        budgetDaily: budgetMicros / 1_000_000,
      }),
    ),
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
        tenantName: 'Ads Write Corp',
        tenantSlug: 'ads-write-corp',
        email: 'ads-write-owner@example.com',
        password: 'Password123!',
        firstName: 'Ads',
        lastName: 'Owner',
      })
      .expect(201);

    cookies = toCookieHeader(registerResponse.headers['set-cookie']);
    tenantId = registerResponse.body.user.tenantId as string;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /integrations/google-ads/campaigns/:id/pause', () => {
    it('200 - pause la campagne', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/camp_1/pause')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.status).toBe('PAUSED');
      expect(googleAdsServiceMock.pauseCampaign).toHaveBeenCalledWith(
        tenantId,
        'camp_1',
      );
    });

    it('404 - campagne inconnue', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/unknown/pause')
        .set('Cookie', cookies)
        .expect(404);
    });

    it('401 - sans token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/camp_1/pause')
        .expect(401);
    });
  });

  describe('POST /integrations/google-ads/campaigns/:id/enable', () => {
    it('200 - reactive la campagne', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/camp_1/enable')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.status).toBe('ENABLED');
      expect(googleAdsServiceMock.enableCampaign).toHaveBeenCalledWith(
        tenantId,
        'camp_1',
      );
    });

    it('401 - sans token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/camp_1/enable')
        .expect(401);
    });
  });

  describe('PATCH /integrations/google-ads/campaigns/:id/budget', () => {
    it('200 - met a jour le budget', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/integrations/google-ads/campaigns/camp_1/budget')
        .set('Cookie', cookies)
        .send({ budgetMicros: 100_000_000 })
        .expect(200);

      expect(Number(response.body.budgetDaily)).toBe(100);
      expect(googleAdsServiceMock.updateBudget).toHaveBeenCalledWith(
        tenantId,
        'camp_1',
        100_000_000,
      );
    });

    it('400 - budgetMicros manquant', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/integrations/google-ads/campaigns/camp_1/budget')
        .set('Cookie', cookies)
        .send({})
        .expect(400);
    });

    it('400 - budgetMicros negatif', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/integrations/google-ads/campaigns/camp_1/budget')
        .set('Cookie', cookies)
        .send({ budgetMicros: -1000 })
        .expect(400);
    });

    it('401 - sans token', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/integrations/google-ads/campaigns/camp_1/budget')
        .send({ budgetMicros: 50_000_000 })
        .expect(401);
    });
  });
});
