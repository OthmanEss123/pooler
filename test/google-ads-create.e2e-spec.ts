/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.QUEUE_ENABLED ??= 'false';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_mock_1234567890';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_mock_1234567890';
process.env.STRIPE_STARTER_PRICE_ID ??= 'price_test_starter';
process.env.STRIPE_GROWTH_PRICE_ID ??= 'price_test_growth';
process.env.STRIPE_SCALE_PRICE_ID ??= 'price_test_scale';

type MockAdCampaign = {
  id: string;
  tenantId: string;
  externalId: string;
  name: string;
  type: string;
  status: string;
  budgetDaily: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  syncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExtendedPrismaMock = ReturnType<typeof createPrismaMock> & {
  integration: {
    findUnique: jest.Mock;
  };
  adCampaign: {
    findMany: jest.Mock;
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const extendPrismaMock = () => {
  const prismaMock = createPrismaMock() as ExtendedPrismaMock;
  const adCampaigns: MockAdCampaign[] = [];
  let adCampaignCounter = 1;

  prismaMock.integration = {
    findUnique: jest.fn().mockResolvedValue(null),
  };

  prismaMock.adCampaign = {
    findMany: jest.fn(
      ({
        where,
        orderBy,
      }: {
        where?: { tenantId?: string; status?: string };
        orderBy?: { updatedAt?: 'asc' | 'desc' };
      }) => {
        const filtered = adCampaigns.filter((campaign) => {
          if (where?.tenantId && campaign.tenantId !== where.tenantId) {
            return false;
          }

          if (where?.status && campaign.status !== where.status) {
            return false;
          }

          return true;
        });

        filtered.sort((left, right) => {
          if (orderBy?.updatedAt === 'asc') {
            return left.updatedAt.getTime() - right.updatedAt.getTime();
          }

          return right.updatedAt.getTime() - left.updatedAt.getTime();
        });

        return filtered.map((campaign) => ({ ...campaign }));
      },
    ),
    createMany: jest.fn(
      ({ data }: { data: Array<Partial<MockAdCampaign>> }) => {
        for (const item of data) {
          const now = new Date();
          adCampaigns.push({
            id: item.id ?? `ad-campaign-${adCampaignCounter++}`,
            tenantId: String(item.tenantId),
            externalId: String(item.externalId),
            name: String(item.name),
            type: String(item.type),
            status: String(item.status ?? 'ENABLED'),
            budgetDaily:
              item.budgetDaily === undefined || item.budgetDaily === null
                ? null
                : Number(item.budgetDaily),
            spend: Number(item.spend ?? 0),
            impressions: Number(item.impressions ?? 0),
            clicks: Number(item.clicks ?? 0),
            conversions: Number(item.conversions ?? 0),
            conversionValue: Number(item.conversionValue ?? 0),
            roas: Number(item.roas ?? 0),
            syncedAt: item.syncedAt ?? null,
            createdAt: item.createdAt ?? now,
            updatedAt: item.updatedAt ?? now,
          });
        }

        return { count: data.length };
      },
    ),
    deleteMany: jest.fn(({ where }: { where?: { tenantId?: string } }) => {
      let count = 0;

      for (let index = adCampaigns.length - 1; index >= 0; index -= 1) {
        if (where?.tenantId && adCampaigns[index].tenantId !== where.tenantId) {
          continue;
        }

        adCampaigns.splice(index, 1);
        count += 1;
      }

      return { count };
    }),
  };

  return prismaMock;
};

describe('Google Ads Create Campaign (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = extendPrismaMock();

  const owner = {
    tenantName: 'Ads Create Corp',
    tenantSlug: 'ads-create-corp',
    email: 'ads-create-owner@example.com',
    password: 'Password123!',
    firstName: 'Ads',
    lastName: 'Owner',
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

    cookies = toCookieHeader(
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

  describe('Without Google Ads integration', () => {
    it('POST /campaigns -> 404 when integration is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns')
        .set('Cookie', cookies)
        .send({
          name: 'Test SEARCH',
          type: 'SEARCH',
          budgetDailyMicros: 10_000_000,
        })
        .expect(404);
    });

    it('POST /campaigns/performance-max -> 404 when integration is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns/performance-max')
        .set('Cookie', cookies)
        .send({
          name: 'Test PMax',
          type: 'PERFORMANCE_MAX',
          budgetDailyMicros: 20_000_000,
        })
        .expect(404);
    });

    it('POST /ad-groups -> 404 when integration is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/ad-groups')
        .set('Cookie', cookies)
        .send({
          campaignExternalId: '1234567890',
          name: 'Test Ad Group',
        })
        .expect(404);
    });

    it('GET /campaigns/budget-recommendations -> 200 with an empty list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/integrations/google-ads/campaigns/budget-recommendations')
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('DTO validation', () => {
    it('400 when name is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns')
        .set('Cookie', cookies)
        .send({
          type: 'SEARCH',
          budgetDailyMicros: 10_000_000,
        })
        .expect(400);
    });

    it('400 when type is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns')
        .set('Cookie', cookies)
        .send({
          name: 'Test',
          type: 'INVALID_TYPE',
          budgetDailyMicros: 10_000_000,
        })
        .expect(400);
    });

    it('400 when budget is negative', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns')
        .set('Cookie', cookies)
        .send({
          name: 'Test',
          type: 'SEARCH',
          budgetDailyMicros: -1,
        })
        .expect(400);
    });

    it('401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/integrations/google-ads/campaigns')
        .send({
          name: 'Test',
          type: 'SEARCH',
          budgetDailyMicros: 10_000_000,
        })
        .expect(401);
    });
  });

  describe('GET /campaigns/budget-recommendations', () => {
    it('200 with recommendations based on stored campaign performance', async () => {
      await prismaMock.adCampaign.deleteMany({ where: { tenantId } });

      await prismaMock.adCampaign.createMany({
        data: [
          {
            tenantId,
            externalId: `ext-good-${Date.now()}`,
            name: 'High ROAS Campaign',
            type: 'SEARCH',
            status: 'ENABLED',
            spend: 100,
            roas: 4.5,
            budgetDaily: 50,
          },
          {
            tenantId,
            externalId: `ext-bad-${Date.now()}`,
            name: 'Low ROAS Campaign',
            type: 'SEARCH',
            status: 'ENABLED',
            spend: 100,
            roas: 0.8,
            budgetDaily: 50,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/integrations/google-ads/campaigns/budget-recommendations')
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const recommendations = response.body as Array<
        Record<string, number | string>
      >;
      const increase = recommendations.find(
        (recommendation) => recommendation.recommendation === 'increase',
      );
      const decrease = recommendations.find(
        (recommendation) => recommendation.recommendation === 'decrease',
      );

      expect(increase).toBeDefined();
      expect(Number(increase?.suggestedBudget)).toBeGreaterThan(
        Number(increase?.currentBudget),
      );

      expect(decrease).toBeDefined();
      expect(Number(decrease?.suggestedBudget)).toBeLessThan(
        Number(decrease?.currentBudget),
      );
    });

    it('401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/google-ads/campaigns/budget-recommendations')
        .expect(401);
    });
  });
});
