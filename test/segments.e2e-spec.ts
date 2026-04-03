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

describe('Segments (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let tenantId = '';
  let segmentId = '';
  let readOnlyApiKey = '';

  const prismaMock = createPrismaMock();

  const owner = {
    tenantName: 'Segment Corp',
    tenantSlug: 'segment-corp',
    email: 'segment-owner@example.com',
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

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    ownerCookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );
    tenantId = registerResponse.body.user.tenantId as string;

    const apiKeyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/api-keys')
      .set('Cookie', ownerCookies)
      .send({ name: 'Segments Read Only', scope: ApiKeyScope.READ_ONLY })
      .expect(201);

    readOnlyApiKey = apiKeyResponse.body.key as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /segments', () => {
    it('201 - creates a segment for an owner', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/segments')
        .set('Cookie', ownerCookies)
        .send({
          name: 'Subscribed Customers',
          type: 'DYNAMIC',
          conditions: {
            operator: 'AND',
            rules: [
              { field: 'emailStatus', operator: 'eq', value: 'SUBSCRIBED' },
            ],
          },
        })
        .expect(201);

      expect(response.body.name).toBe('Subscribed Customers');
      expect(response.body.tenantId).toBe(tenantId);
      segmentId = response.body.id as string;
    });

    it('400 - rejects an invalid body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/segments')
        .set('Cookie', ownerCookies)
        .send({ name: 'Missing conditions' })
        .expect(400);
    });

    it('401 - rejects anonymous writes', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/segments')
        .send({
          name: 'Anonymous Segment',
          type: 'DYNAMIC',
          conditions: {
            operator: 'AND',
            rules: [
              { field: 'emailStatus', operator: 'eq', value: 'SUBSCRIBED' },
            ],
          },
        })
        .expect(401);
    });

    it('403 - blocks a read-only API key from creating a segment', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/segments')
        .set('x-api-key', readOnlyApiKey)
        .send({
          name: 'Blocked Segment',
          type: 'DYNAMIC',
          conditions: {
            operator: 'AND',
            rules: [
              { field: 'emailStatus', operator: 'eq', value: 'SUBSCRIBED' },
            ],
          },
        })
        .expect(403);
    });
  });

  describe('GET /segments', () => {
    it('200 - lists tenant segments for the owner', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/segments')
        .set('Cookie', ownerCookies)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].tenantId).toBe(tenantId);
    });

    it('200 - allows read access through a read-only API key', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/segments')
        .set('x-api-key', readOnlyApiKey)
        .expect(200);
    });

    it('401 - rejects anonymous reads', async () => {
      await request(app.getHttpServer()).get('/api/v1/segments').expect(401);
    });
  });

  describe('GET /segments/:id', () => {
    it('200 - returns one segment', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/segments/${segmentId}`)
        .set('Cookie', ownerCookies)
        .expect(200);

      expect(response.body.id).toBe(segmentId);
    });

    it('404 - returns not found for an unknown segment', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/segments/unknown-segment')
        .set('Cookie', ownerCookies)
        .expect(404);
    });
  });

  describe('POST /segments/preview', () => {
    it('200 - returns a count payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/segments/preview')
        .set('Cookie', ownerCookies)
        .send({
          conditions: {
            operator: 'AND',
            rules: [
              { field: 'emailStatus', operator: 'eq', value: 'SUBSCRIBED' },
            ],
          },
        })
        .expect(200);

      expect(response.body).toHaveProperty('count');
      expect(typeof response.body.count).toBe('number');
    });
  });

  describe('POST /segments/:id/sync', () => {
    it('200 - syncs segment members', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/segments/${segmentId}/sync`)
        .set('Cookie', ownerCookies)
        .expect(200);

      expect(response.body.segmentId).toBe(segmentId);
      expect(typeof response.body.synced).toBe('number');
    });

    it('403 - blocks a read-only API key from syncing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/segments/${segmentId}/sync`)
        .set('x-api-key', readOnlyApiKey)
        .expect(403);
    });
  });

  describe('DELETE /segments/:id', () => {
    it('204 - deletes the segment', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/segments/${segmentId}`)
        .set('Cookie', ownerCookies)
        .expect(204);
    });

    it('404 - returns not found once the segment is deleted', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/segments/${segmentId}`)
        .set('Cookie', ownerCookies)
        .expect(404);
    });
  });
});
