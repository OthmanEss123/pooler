/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EmbeddingsService } from '../src/modules/contacts/embeddings.service';
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

describe('Embeddings (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  const contactId = 'contact-123';

  const prismaMock = createPrismaMock();
  const embeddingsServiceMock = {
    embedContact: jest.fn().mockResolvedValue({ embedded: 1 }),
    embedAllContacts: jest.fn().mockResolvedValue({ embedded: 3 }),
    findSimilarContacts: jest.fn().mockResolvedValue([
      {
        contact: {
          id: 'similar-1',
          email: 'similar@example.com',
          firstName: 'Similar',
          lastName: 'Customer',
          totalRevenue: '120.00',
          totalOrders: 2,
        },
        similarity: 0.91,
      },
    ]),
  };

  const owner = {
    tenantName: 'Embeddings Corp',
    tenantSlug: 'embeddings-corp',
    email: 'embeddings-owner@example.com',
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
      .overrideProvider(EmbeddingsService)
      .useValue(embeddingsServiceMock)
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

  it('POST /contacts/embed -> 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/contacts/embed')
      .set('Cookie', cookies)
      .send({ contactId })
      .expect(201);

    expect(response.body.embedded).toBe(1);
  });

  it('GET /contacts/:id/similar -> 200', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}/similar`)
      .set('Cookie', cookies)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].similarity).toBeGreaterThan(0.8);
  });
});
