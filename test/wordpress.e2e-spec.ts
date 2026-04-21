/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { WordPressApiClient } from '../src/modules/integrations/wordpress/wordpress-api.client';
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
process.env.WORDPRESS_WEBHOOK_SECRET = '';

type MembershipStoreRow = {
  role: string;
};

type UserStoreRow = {
  tenantId: string;
};

type ContactStoreRow = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  sourceChannel?: string | null;
  properties?: unknown;
};

type WordPressPostStoreRow = {
  externalId: string;
  title: string;
};

describe('WordPress (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock();
  const membershipStore = prismaMock.__stores
    .memberships as MembershipStoreRow[];
  const userStore = prismaMock.__stores.users as UserStoreRow[];
  const contactStore = prismaMock.__stores.contacts as ContactStoreRow[];
  const wordPressPostStore = prismaMock.__stores
    .wordpressPosts as WordPressPostStoreRow[];

  const wordPressApiClientMock = {
    testConnection: jest.fn().mockResolvedValue(undefined),
    getUsers: jest.fn(
      (_siteUrl: string, _credentials: unknown, page: number) => {
        if (page !== 1) {
          return Promise.resolve([]);
        }

        return Promise.resolve([
          {
            id: 101,
            email: 'wp-user@example.com',
            name: 'Jane Doe',
            roles: ['subscriber'],
          },
        ]);
      },
    ),
    getPosts: jest.fn(
      (_siteUrl: string, _credentials: unknown, page: number) => {
        if (page !== 1) {
          return Promise.resolve([]);
        }

        return Promise.resolve([
          {
            id: 501,
            title: {
              rendered: 'Pilot launches WordPress sync',
            },
            link: 'https://example.com/pilot-wordpress-sync',
            date: '2026-04-10T09:00:00.000Z',
            categories: [12],
          },
        ]);
      },
    ),
  };

  const owner = {
    tenantName: 'WordPress Corp',
    tenantSlug: 'wordpress-corp',
    email: 'wordpress-owner@example.com',
    password: 'Password123!',
  };

  const connectPayload = {
    siteUrl: 'https://example.com',
    consumerKey: 'pilot-user',
    consumerSecret: 'pilot-app-password',
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
      .overrideProvider(WordPressApiClient)
      .useValue(wordPressApiClientMock)
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

    tenantId = userStore[0].tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /integrations/wordpress/connect -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/connect')
      .send(connectPayload)
      .expect(401);
  });

  it('POST /integrations/wordpress/connect -> 403 pour MEMBER', async () => {
    membershipStore[0].role = 'MEMBER';

    await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/connect')
      .set('Cookie', cookies)
      .send(connectPayload)
      .expect(403);

    membershipStore[0].role = 'OWNER';
  });

  it('POST /integrations/wordpress/connect -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/connect')
      .set('Cookie', cookies)
      .send(connectPayload)
      .expect(201);

    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.type).toBe('WORDPRESS');
  });

  it('GET /integrations/wordpress/status -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/integrations/wordpress/status')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.status).toBe('ACTIVE');
    expect(response.body.provider).toBe('wordpress');
  });

  it('POST /integrations/wordpress/webhook/:tenantId -> 200 et cree un contact', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/integrations/wordpress/webhook/${tenantId}`)
      .set('x-wp-event', 'user_register')
      .send({
        ID: 777,
        email: 'webhook-user@example.com',
        display_name: 'Webhook User',
        user_registered: '2026-04-12T10:30:00.000Z',
        roles: ['subscriber'],
      })
      .expect(200);

    const createdContact = contactStore.find(
      (contact) => contact.email === 'webhook-user@example.com',
    );

    expect(createdContact).toMatchObject({
      email: 'webhook-user@example.com',
      firstName: 'Webhook',
      lastName: 'User',
      sourceChannel: 'wordpress',
    });
    expect(createdContact?.properties).toMatchObject({
      wpUserId: '777',
      wpRoles: ['subscriber'],
    });
  });

  it('POST /integrations/wordpress/webhook/:tenantId -> 404 sans tenant valide', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/webhook/tenant-inconnu')
      .set('x-wp-event', 'user_register')
      .send({
        ID: 778,
        email: 'missing-tenant@example.com',
        display_name: 'Ghost User',
        roles: ['subscriber'],
      })
      .expect(404);
  });

  it('POST /integrations/wordpress/sync/users -> 401 sans auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/sync/users')
      .expect(401);
  });

  it('POST /integrations/wordpress/sync/users -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/sync/users')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.synced).toBe(1);

    const syncedContact = contactStore.find(
      (contact) => contact.email === 'wp-user@example.com',
    );

    expect(syncedContact).toMatchObject({
      email: 'wp-user@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      sourceChannel: 'wordpress',
    });
  });

  it('POST /integrations/wordpress/sync/users -> 200 avec email fallback si WordPress le masque', async () => {
    wordPressApiClientMock.getUsers.mockImplementationOnce(
      (_siteUrl: string, _credentials: unknown, page: number) => {
        if (page !== 1) {
          return Promise.resolve([]);
        }

        return Promise.resolve([
          {
            id: 202,
            slug: 'client1',
            name: 'Client One',
            roles: ['subscriber'],
          },
        ]);
      },
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/sync/users')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.synced).toBe(1);

    const syncedContact = contactStore.find(
      (contact) => contact.email === 'client1@wordpress.local',
    );

    expect(syncedContact).toMatchObject({
      email: 'client1@wordpress.local',
      firstName: 'Client',
      lastName: 'One',
      sourceChannel: 'wordpress',
    });
  });

  it('POST /integrations/wordpress/sync/posts -> 200', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/sync/posts')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.synced).toBe(1);
    expect(wordPressPostStore).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: '501',
          title: 'Pilot launches WordPress sync',
        }),
      ]),
    );
  });

  it('POST /integrations/wordpress/disconnect -> 200 puis status DISCONNECTED', async () => {
    const disconnectResponse = await request(app.getHttpServer())
      .post('/api/v1/integrations/wordpress/disconnect')
      .set('Cookie', cookies)
      .expect(200);

    expect(disconnectResponse.body.status).toBe('DISCONNECTED');

    const statusResponse = await request(app.getHttpServer())
      .get('/api/v1/integrations/wordpress/status')
      .set('Cookie', cookies)
      .expect(200);

    expect(statusResponse.body.status).toBe('DISCONNECTED');
    expect(statusResponse.body.connected).toBe(false);
  });
});
