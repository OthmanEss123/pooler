/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyScope } from '@prisma/client';
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

describe('Tenants + Memberships (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let memberId = '';
  let readOnlyApiKey = '';

  const prismaMock = createPrismaMock();

  const owner = {
    tenantName: 'Owner Corp',
    tenantSlug: 'owner-corp',
    email: 'owner@example.com',
    password: 'Password123!',
    firstName: 'Owner',
    lastName: 'User',
  };

  const invitedUser = {
    tenantName: 'Invitee Corp',
    tenantSlug: 'invitee-corp',
    email: 'invitee@example.com',
    password: 'Password123!',
    firstName: 'Invited',
    lastName: 'Member',
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

    const ownerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    ownerCookies = toCookieHeader(
      ownerResponse.headers['set-cookie'] as unknown as string[],
    );

    const invitedResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(invitedUser)
      .expect(201);

    memberId = invitedResponse.body.user.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the current tenant for the owner', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.slug).toBe(owner.tenantSlug);
  });

  it('returns real tenant stats from the current schema', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/stats')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body).toMatchObject({
      memberCount: 1,
      activeApiKeys: 0,
      activeSessions: 1,
    });
  });

  it('allows the owner to update tenant details', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .set('Cookie', ownerCookies)
      .send({ name: 'Owner Corp Updated' })
      .expect(200);

    expect(response.body.name).toBe('Owner Corp Updated');
  });

  it('invites an existing user and exposes the owner membership in the list', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tenants/me/members')
      .set('Cookie', ownerCookies)
      .send({ email: invitedUser.email })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/members')
      .set('Cookie', ownerCookies)
      .expect(200);

    const emails = (response.body as Array<{ user: { email: string } }>).map(
      (membership) => membership.user.email,
    );

    expect(emails).toEqual(
      expect.arrayContaining([owner.email, invitedUser.email]),
    );
  });

  it('lets the owner update and remove memberships', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/tenants/me/members/${memberId}/role`)
      .set('Cookie', ownerCookies)
      .send({ role: 'ADMIN' })
      .expect(200);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/tenants/me/members/${memberId}`)
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(deleteResponse.body.removed).toBe(true);
  });

  it('allows creating a read-only API key only for an owner and blocks admin writes with it', async () => {
    const apiKeyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/api-keys')
      .set('Cookie', ownerCookies)
      .send({ name: 'Read Only', scope: ApiKeyScope.READ_ONLY })
      .expect(201);

    readOnlyApiKey = apiKeyResponse.body.key as string;
    expect(readOnlyApiKey).toMatch(/^pk_/);

    await request(app.getHttpServer())
      .get('/api/v1/tenants/me')
      .set('x-api-key', readOnlyApiKey)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .set('x-api-key', readOnlyApiKey)
      .send({ name: 'Blocked by scope' })
      .expect(403);
  });
});
