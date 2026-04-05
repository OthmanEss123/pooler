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
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';
process.env.SHOPIFY_API_KEY ??= 'shopify_test_key';
process.env.SHOPIFY_API_SECRET ??= 'shopify_test_secret';
process.env.SHOPIFY_REDIRECT_URI ??=
  'http://localhost:3000/api/v1/integrations/shopify/oauth/callback';

describe('Shopify OAuth (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = createPrismaMock();

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
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Shopify OAuth Corp',
        tenantSlug: 'shopify-oauth-corp',
        email: 'shopify-oauth@example.com',
        password: 'Password123!',
        firstName: 'Shopify',
        lastName: 'Owner',
      })
      .expect(201);

    cookies = toCookieHeader(registerResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /integrations/shopify/oauth/url', () => {
    it('200 - retourne URL OAuth avec state', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/url')
        .set('Cookie', cookies)
        .query({ shop: 'test-store.myshopify.com' })
        .expect(200);

      expect(response.body).toHaveProperty('url');
      expect(response.body.url).toContain('test-store.myshopify.com');
      expect(response.body.url).toContain('state=');
      expect(response.body.url).toContain('scope=');
      expect(response.body.url).toContain('client_id=shopify_test_key');
    });

    it('400 - shop manquant', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/url')
        .set('Cookie', cookies)
        .expect(400);
    });

    it('400 - shop invalide', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/url')
        .set('Cookie', cookies)
        .query({ shop: 'https://evil.example.com' })
        .expect(400);
    });

    it('401 - sans token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/url')
        .query({ shop: 'test-store.myshopify.com' })
        .expect(401);
    });
  });

  describe('GET /integrations/shopify/oauth/callback', () => {
    it('400 - state invalide ou expire', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/callback')
        .query({
          shop: 'test-store.myshopify.com',
          code: 'fake_code',
          state: 'invalid_state_not_in_redis',
        })
        .expect(400);
    });

    it('400 - shop ne correspond pas au state stocke', async () => {
      const oauthUrlResponse = await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/url')
        .set('Cookie', cookies)
        .query({ shop: 'test-store.myshopify.com' })
        .expect(200);

      const state = new URL(
        oauthUrlResponse.body.url as string,
      ).searchParams.get('state');

      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/callback')
        .query({
          shop: 'other-store.myshopify.com',
          code: 'fake_code',
          state,
        })
        .expect(400);
    });

    it('400 - code manquant', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/callback')
        .query({
          shop: 'test-store.myshopify.com',
          state: 'some_state',
        })
        .expect(400);
    });

    it('400 - state manquant', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/integrations/shopify/oauth/callback')
        .query({
          shop: 'test-store.myshopify.com',
          code: 'some_code',
        })
        .expect(400);
    });
  });
});
