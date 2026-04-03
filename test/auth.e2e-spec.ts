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

describe('Auth (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];

  const prismaMock = createPrismaMock();

  const testUser = {
    tenantName: 'Test Corp',
    tenantSlug: 'test-corp',
    email: 'test@example.com',
    password: 'Password123!',
    firstName: 'Test',
    lastName: 'User',
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a tenant owner and sets auth cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: testUser.email,
      role: 'OWNER',
      firstName: testUser.firstName,
      lastName: testUser.lastName,
    });
    expect(response.body.tenant.slug).toBe(testUser.tenantSlug);

    cookies = toCookieHeader(
      response.headers['set-cookie'] as unknown as string[],
    );
    expect(cookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^access_token=/),
        expect.stringMatching(/^refresh_token=/),
        expect.stringMatching(/^token_family=/),
      ]),
    );
  });

  it('rejects duplicate email registration', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser)
      .expect(409);
  });

  it('logs in and rotates cookies', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(response.body.user.email).toBe(testUser.email);
    cookies = toCookieHeader(
      response.headers['set-cookie'] as unknown as string[],
    );
  });

  it('rejects invalid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: 'wrong' })
      .expect(401);
  });

  it('returns the authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.email).toBe(testUser.email);
    expect(response.body.role).toBe('OWNER');
  });

  it('refreshes the session', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .expect(200);

    expect(response.body.ok).toBe(true);
    cookies = toCookieHeader(
      response.headers['set-cookie'] as unknown as string[],
    );
  });

  it('logs out and invalidates further /me access', async () => {
    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookies)
      .expect(200);

    expect(logoutResponse.body.ok).toBe(true);
    cookies = toCookieHeader(
      logoutResponse.headers['set-cookie'] as unknown as string[],
    );

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookies)
      .expect(401);
  });
});
