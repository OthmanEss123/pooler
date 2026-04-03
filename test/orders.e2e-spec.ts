/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { createCommercePrismaMock } from './support/create-commerce-prisma-mock';
import { toCookieHeader } from './support/create-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

describe('Orders (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let cookies: string[] = [];
  let tenantId = '';
  let orderId = '';
  let contactEmail = 'customer@example.com';

  const prismaMock = createCommercePrismaMock();

  const owner = {
    tenantName: 'Orders Corp',
    tenantSlug: 'orders-corp',
    email: 'orders-owner@example.com',
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

    const setCookie = registerResponse.headers['set-cookie'];
    cookies = toCookieHeader(
      Array.isArray(setCookie)
        ? setCookie
        : setCookie
          ? [setCookie]
          : undefined,
    );
    tenantId = registerResponse.body.user.tenantId as string;
    contactEmail = 'customer@example.com';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('201 - creates an order and auto-creates the contact', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', cookies)
        .send({
          contactEmail,
          externalId: 'shopify-1001',
          orderNumber: '#1001',
          status: 'PAID',
          totalAmount: 150,
          subtotal: 140,
          currency: 'EUR',
          placedAt: new Date('2026-03-26T12:00:00.000Z').toISOString(),
          items: [
            {
              name: 'T-shirt',
              quantity: 2,
              unitPrice: 70,
              totalPrice: 140,
            },
          ],
        })
        .expect(201);

      expect(response.body.status).toBe('PAID');
      expect(response.body.items).toHaveLength(1);
      orderId = response.body.id as string;
    });

    it('400 - rejects an invalid body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Cookie', cookies)
        .send({ orderNumber: '#1002' })
        .expect(400);
    });

    it('401 - rejects anonymous writes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send({})
        .expect(401);
    });
  });

  describe('GET /orders', () => {
    it('200 - lists the orders', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('200 - filters by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders?status=PAID')
        .set('Cookie', cookies)
        .expect(200);

      const data = response.body.data as Array<{ status: string }>;

      data.forEach((order) => {
        expect(order.status).toBe('PAID');
      });
    });
  });

  describe('GET /orders/:id', () => {
    it('200 - returns an order with its items', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.id).toBe(orderId);
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items).toHaveLength(1);
    });

    it('404 - returns not found for an unknown order', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orders/unknown-order')
        .set('Cookie', cookies)
        .expect(404);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('200 - updates the status', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Cookie', cookies)
        .send({ status: 'FULFILLED' })
        .expect(200);

      expect(response.body.status).toBe('FULFILLED');
    });
  });

  describe('Contact metrics recalculation', () => {
    it('keeps totalOrders and totalRevenue in sync after an order', async () => {
      const contact = await prisma.contact.findFirst({
        where: { tenantId, email: contactEmail },
      });

      expect(contact).toBeDefined();
      expect(contact!.totalOrders).toBeGreaterThan(0);
      expect(Number(contact!.totalRevenue)).toBeGreaterThan(0);
    });
  });
});
