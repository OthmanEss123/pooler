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

describe('Contacts Export CSV (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let memberCookies: string[] = [];
  let tenantId = '';

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

    const ownerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Export Corp',
        tenantSlug: 'export-corp',
        email: 'export-owner@example.com',
        password: 'Password123!',
        firstName: 'Export',
        lastName: 'Owner',
      })
      .expect(201);
    ownerCookies = toCookieHeader(ownerResponse.headers['set-cookie']);
    tenantId = ownerResponse.body.user.tenantId as string;

    const memberResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Member Corp',
        tenantSlug: 'member-export-corp',
        email: 'member-export@example.com',
        password: 'Password123!',
        firstName: 'Member',
        lastName: 'User',
      })
      .expect(201);
    memberCookies = toCookieHeader(memberResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /contacts/export', () => {
    it('200 - retourne CSV avec bons headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts/export')
        .set('Cookie', ownerCookies)
        .set('X-Forwarded-For', '1.1.1.1')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('contacts.csv');
      expect(response.text).toContain('email');
      expect(response.text).toContain('firstName');
      expect(response.text).toContain('totalOrders');
    });

    it('200 - contient les contacts du tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/contacts/export')
        .set('Cookie', ownerCookies)
        .set('X-Forwarded-For', '1.1.1.2')
        .expect(200);

      const lines = response.text.split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('200 - ADMIN peut exporter apres switch de tenant', async () => {
      const adminResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Admin Export Org',
          tenantSlug: 'admin-export-org',
          email: 'admin-export@example.com',
          password: 'Password123!',
          firstName: 'Admin',
          lastName: 'Exporter',
        })
        .expect(201);
      const adminCookies = toCookieHeader(adminResponse.headers['set-cookie']);

      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/members')
        .set('Cookie', ownerCookies)
        .send({ email: 'admin-export@example.com', role: 'ADMIN' })
        .expect(201);

      const switchResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/switch-tenant')
        .set('Cookie', adminCookies)
        .send({ tenantId })
        .expect(200);

      const switchedCookies = toCookieHeader(
        switchResponse.headers['set-cookie'],
      );

      await request(app.getHttpServer())
        .get('/api/v1/contacts/export')
        .set('Cookie', switchedCookies)
        .set('X-Forwarded-For', '1.1.1.3')
        .expect(200);
    });

    it('401 - sans token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contacts/export')
        .set('X-Forwarded-For', '1.1.1.4')
        .expect(401);
    });

    it('403 - MEMBER ne peut pas exporter apres switch de tenant', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tenants/me/members')
        .set('Cookie', ownerCookies)
        .send({ email: 'member-export@example.com', role: 'MEMBER' })
        .expect(201);

      const switchResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/switch-tenant')
        .set('Cookie', memberCookies)
        .send({ tenantId })
        .expect(200);

      const switchedCookies = toCookieHeader(
        switchResponse.headers['set-cookie'],
      );

      await request(app.getHttpServer())
        .get('/api/v1/contacts/export')
        .set('Cookie', switchedCookies)
        .set('X-Forwarded-For', '1.1.1.5')
        .expect(403);
    });
  });
});
