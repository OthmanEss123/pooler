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
process.env.JWT_SECRET ??= '12345678901234567890123456789012';
process.env.JWT_EXPIRES_IN ??= '15m';

describe('Contacts (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let cookies: string[] = [];
  let tenantId = '';
  let contactId = '';

  const prismaMock = createCommercePrismaMock();

  const owner = {
    tenantName: 'Contacts Corp',
    tenantSlug: 'contacts-corp',
    email: 'contacts-owner@example.com',
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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /contacts', () => {
    it('201 - creates a contact', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', cookies)
        .send({
          email: 'client@example.com',
          firstName: 'Jean',
          lastName: 'Dupont',
        })
        .expect(201);

      expect(response.body.email).toBe('client@example.com');
      expect(response.body.tenantId).toBe(tenantId);
      contactId = response.body.id as string;
    });

    it('409 - rejects a duplicate email in the same tenant', async () => {
      const contact = await prisma.contact.findFirst({ where: { tenantId } });

      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', cookies)
        .send({ email: contact!.email })
        .expect(409);
    });

    it('400 - rejects an invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Cookie', cookies)
        .send({ email: 'pas-un-email' })
        .expect(400);
    });

    it('401 - rejects anonymous writes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .send({ email: 'test@example.com' })
        .expect(401);
    });
  });

  describe('POST /contacts/bulk', () => {
    it('200 - upserts contacts in bulk', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/contacts/bulk')
        .set('Cookie', cookies)
        .send({
          contacts: [
            { email: 'bulk-1@example.com' },
            { email: 'bulk-2@example.com' },
          ],
        })
        .expect(200);

      expect(response.body.upserted).toBe(2);
      expect(response.body.failed).toBe(0);
    });
  });

  describe('GET /contacts', () => {
    it('200 - lists contacts with a total', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Cookie', cookies)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('200 - supports pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts?limit=2&offset=0')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

    it('200 - supports search by email', async () => {
      const contact = await prisma.contact.findFirst({ where: { tenantId } });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/contacts?search=${contact!.email}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.total).toBeGreaterThan(0);
    });

    it('401 - rejects anonymous reads', async () => {
      await request(app.getHttpServer()).get('/api/v1/contacts').expect(401);
    });
  });

  describe('GET /contacts/:id', () => {
    it('200 - returns a contact with orders and segments', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/contacts/${contactId}`)
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.id).toBe(contactId);
      expect(Array.isArray(response.body.orders)).toBe(true);
      expect(Array.isArray(response.body.segmentMembers)).toBe(true);
    });

    it('404 - returns not found for an unknown contact', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contacts/unknown-contact')
        .set('Cookie', cookies)
        .expect(404);
    });
  });

  describe('PATCH /contacts/:id', () => {
    it('200 - updates the contact', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/contacts/${contactId}`)
        .set('Cookie', cookies)
        .send({ firstName: 'Pierre' })
        .expect(200);

      expect(response.body.firstName).toBe('Pierre');
    });
  });

  describe('DELETE /contacts/:id', () => {
    it('204 - deletes the contact', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${contactId}`)
        .set('Cookie', cookies)
        .expect(204);
    });

    it('404 - returns not found after deletion', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/contacts/${contactId}`)
        .set('Cookie', cookies)
        .expect(404);
    });
  });
});
