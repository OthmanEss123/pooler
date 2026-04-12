/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import Stripe from 'stripe';
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
process.env.STRIPE_SECRET_KEY ??= 'sk_test_mock_1234567890';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_mock_1234567890';
process.env.STRIPE_STARTER_PRICE_ID ??= 'price_test_starter';
process.env.STRIPE_GROWTH_PRICE_ID ??= 'price_test_growth';
process.env.STRIPE_SCALE_PRICE_ID ??= 'price_test_scale';

describe('Billing (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let cookies: string[] = [];
  let tenantId = '';
  let subscribedCustomerId = '';
  let subscribedSubscriptionId = '';

  const prismaMock = createPrismaMock();

  const owner = {
    tenantName: 'Billing Corp',
    tenantSlug: 'billing-corp',
    email: 'billing-owner@example.com',
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
    prisma = moduleFixture.get(PrismaService);

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    cookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );
    tenantId = registerResponse.body.user.tenantId as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /billing/plans -> 200 (public)', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/plans')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plan: 'STARTER' }),
        expect.objectContaining({ plan: 'GROWTH' }),
        expect.objectContaining({ plan: 'SCALE' }),
      ]),
    );
  });

  it('GET /billing/usage -> 401 without auth', async () => {
    await request(app.getHttpServer()).get('/api/v1/billing/usage').expect(401);
  });

  it('GET /billing/usage -> 200 with default starter usage', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/usage')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.plan).toBe('STARTER');
    expect(response.body.contacts.used).toBeGreaterThanOrEqual(2);
    expect(response.body.contacts.limit).toBeGreaterThan(0);
  });

  it('POST /billing/subscribe -> 200 for owner', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/billing/subscribe')
      .set('Cookie', cookies)
      .send({ plan: 'GROWTH' })
      .expect(200);

    expect(response.body.subscriptionId).toEqual(expect.any(String));
    expect(response.body.clientSecret).toEqual(expect.any(String));

    subscribedCustomerId = `cus_mock_${tenantId}`;
    subscribedSubscriptionId = response.body.subscriptionId as string;
  });

  it('GET /billing/portal -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/portal')
      .set('Cookie', cookies)
      .query({ returnUrl: 'http://localhost:3001/settings/billing' })
      .expect(200);

    expect(response.body.url).toContain('/billing/portal');
  });

  it('GET /billing/invoices -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/billing/invoices')
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('POST /contacts -> 403 when contact quota is reached', async () => {
    (prisma.contact.count as jest.Mock).mockResolvedValueOnce(100000);

    await request(app.getHttpServer())
      .post('/api/v1/contacts')
      .set('Cookie', cookies)
      .send({ email: 'quota-hit@example.com' })
      .expect(403);
  });

  it('POST /billing/webhook -> 200 and downgrades on subscription deletion', async () => {
    const payload = JSON.stringify({
      id: 'evt_subscription_deleted',
      object: 'event',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: subscribedSubscriptionId,
          object: 'subscription',
          customer: subscribedCustomerId,
          status: 'canceled',
          cancel_at_period_end: false,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 3600,
          metadata: {
            tenantId,
            plan: 'GROWTH',
          },
          items: {
            object: 'list',
            data: [
              {
                price: {
                  id: process.env.STRIPE_GROWTH_PRICE_ID,
                },
              },
            ],
          },
        },
      },
    });

    const signature = (
      Stripe as unknown as {
        webhooks: {
          generateTestHeaderString: (opts: {
            payload: string;
            secret: string;
          }) => string;
        };
      }
    ).webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET as string,
    });

    await request(app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    const usageResponse = await request(app.getHttpServer())
      .get('/api/v1/billing/usage')
      .set('Cookie', cookies)
      .expect(200);

    expect(usageResponse.body.plan).toBe('STARTER');
  });

  it('POST /billing/webhook -> 200 and creates payment failed insight', async () => {
    const payload = JSON.stringify({
      id: 'evt_invoice_failed',
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed_1',
          object: 'invoice',
          customer: subscribedCustomerId,
          subscription: subscribedSubscriptionId,
          amount_due: 4900,
          currency: 'usd',
        },
      },
    });

    const signature = (
      Stripe as unknown as {
        webhooks: {
          generateTestHeaderString: (opts: {
            payload: string;
            secret: string;
          }) => string;
        };
      }
    ).webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET as string,
    });

    await request(app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    const insight = await prisma.insight.findFirst({
      where: {
        tenantId,
        title: 'Paiement echoue',
      },
    });

    expect(insight).not.toBeNull();
  });
});
