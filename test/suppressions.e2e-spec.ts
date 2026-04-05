/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { EmailProviderService } from '../src/modules/email-provider/email-provider.service';
import { createCompliancePrismaMock } from './support/create-compliance-prisma-mock';
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

describe('Suppressions (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let tenantId = '';
  let contactEmail = '';
  let contactId = '';

  const prismaMock = createCompliancePrismaMock();

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
      .overrideProvider(EmailProviderService)
      .useValue({
        sendEmail: jest.fn().mockResolvedValue({
          messageId: 'test-message',
          provider: 'ses',
        }),
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
      .send({
        tenantName: 'Suppression Corp',
        tenantSlug: 'suppression-corp',
        email: 'owner@suppressions.test',
        password: 'Password123!',
        firstName: 'Owner',
        lastName: 'User',
      })
      .expect(201);

    ownerCookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );
    tenantId = registerResponse.body.tenant.id as string;

    const contacts = (await prismaMock.contact.findMany({
      where: { tenantId },
    })) as Array<{ id: string; email: string }>;
    contactId = contacts[0].id;
    contactEmail = contacts[0].email;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/suppressions -> 401 sans auth', async () => {
    await request(app.getHttpServer()).get('/api/v1/suppressions').expect(401);
  });

  it('POST /api/v1/suppressions -> 201 and updates contact compliance state', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/suppressions')
      .set('Cookie', ownerCookies)
      .send({
        email: contactEmail,
        reason: 'UNSUBSCRIBED',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      suppressed: true,
      email: contactEmail,
      reason: 'UNSUBSCRIBED',
    });
    expect(prismaMock.__stores.contacts.get(contactId)).toEqual(
      expect.objectContaining({
        subscribed: false,
        emailStatus: 'UNSUBSCRIBED',
      }),
    );
  });

  it('GET /api/v1/suppressions -> 200 list with the added suppression', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/suppressions')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId,
          email: contactEmail,
          reason: 'UNSUBSCRIBED',
        }),
      ]),
    );
  });

  it('DELETE /api/v1/suppressions/:email -> 204 then removes the record', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/suppressions/${encodeURIComponent(contactEmail)}`)
      .set('Cookie', ownerCookies)
      .expect(204);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/suppressions')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(listResponse.body.total).toBe(0);
  });
});
