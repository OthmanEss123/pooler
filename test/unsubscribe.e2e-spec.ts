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
import { UnsubscribeService } from '../src/modules/email-provider/unsubscribe.service';
import { createCompliancePrismaMock } from './support/create-compliance-prisma-mock';

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.DIRECT_URL ??=
  'postgresql://user:password@localhost:5432/pilot_platform';
process.env.CLICKHOUSE_URL ??= 'http://default:password@localhost:8123/pilot';
process.env.JWT_SECRET ??=
  '1234567890123456789012345678901234567890123456789012345678901234';
process.env.JWT_EXPIRES_IN ??= '15m';

describe('Unsubscribe (e2e)', () => {
  let app: INestApplication<Server>;
  let tenantId = '';
  let contactId = '';
  let contactEmail = '';

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
        tenantName: 'Unsubscribe Corp',
        tenantSlug: 'unsubscribe-corp',
        email: 'owner@unsubscribe.test',
        password: 'Password123!',
        firstName: 'Owner',
        lastName: 'User',
      })
      .expect(201);

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

  it('GET /api/v1/unsubscribe?token=... -> 200 HTML success', async () => {
    const unsubscribeService = app.get(UnsubscribeService);
    const token = unsubscribeService.buildUnsubscribeToken(tenantId, contactId);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/unsubscribe?token=${token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Desabonnement confirme');
    expect(response.text).toContain(contactEmail);
    expect(prismaMock.__stores.globalSuppressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId,
          email: contactEmail,
          reason: 'UNSUBSCRIBED',
        }),
      ]),
    );
    expect(prismaMock.__stores.contacts.get(contactId)).toEqual(
      expect.objectContaining({
        subscribed: false,
        emailStatus: 'UNSUBSCRIBED',
      }),
    );
  });

  it('GET /api/v1/unsubscribe?token=bad -> 400 HTML error', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/unsubscribe?token=bad-token')
      .expect(400);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Lien invalide');
  });
});
