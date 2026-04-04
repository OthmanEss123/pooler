/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { WooCommerceService } from '../src/modules/integrations/woocommerce/woocommerce.service';
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

describe('WooCommerce (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = createPrismaMock();
  const wooCommerceServiceMock = {
    connect: jest.fn().mockResolvedValue({
      status: 'ACTIVE',
      type: 'WOOCOMMERCE',
    }),
    disconnect: jest.fn().mockResolvedValue({
      status: 'DISCONNECTED',
    }),
    getStatus: jest.fn().mockResolvedValue({
      connected: true,
      status: 'ACTIVE',
      provider: 'woocommerce',
    }),
    syncOrders: jest.fn(),
    syncProducts: jest.fn(),
    handleWebhook: jest.fn(),
  };

  const owner = {
    tenantName: 'Woo Corp',
    tenantSlug: 'woo-corp',
    email: 'woo-owner@example.com',
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
      .overrideProvider(WooCommerceService)
      .useValue(wooCommerceServiceMock)
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

    const setCookie = registerResponse.headers['set-cookie'];
    cookies = toCookieHeader(
      Array.isArray(setCookie)
        ? setCookie
        : setCookie
          ? [setCookie]
          : undefined,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /integrations/woocommerce/connect -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/woocommerce/connect')
      .send({
        siteUrl: 'https://example.com',
        consumerKey: 'ck_test',
        consumerSecret: 'cs_test',
      })
      .expect(401);
  });

  it('GET /integrations/woocommerce/status -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/woocommerce/status')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.provider).toBe('woocommerce');
  });

  it('POST /integrations/woocommerce/disconnect -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/woocommerce/disconnect')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('DISCONNECTED');
  });
});
