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
process.env.ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NARRATIVE_AGENT_URL = '';

interface AuthRegisterResponseBody {
  user: { id: string; tenantId: string };
}

interface ImportResponseBody {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

describe('Contacts Import CSV (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let tenantId = '';

  const prismaMock = createPrismaMock();

  const owner = {
    tenantName: 'Import Corp',
    tenantSlug: `import-${Date.now()}`,
    email: `import-${Date.now()}@example.com`,
    password: 'Password123!',
  };

  const validCsv = Buffer.from(
    'email,firstName,lastName,phone\n' +
      `csv-jean-${Date.now()}@test.com,Jean,Dupont,0600000001\n` +
      `csv-marie-${Date.now()}@test.com,Marie,Martin,0600000002\n`,
  );

  const csvWithoutEmail = Buffer.from('firstName,lastName\nJean,Dupont\n');

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
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    cookies = toCookieHeader(res.headers['set-cookie'] as unknown as string[]);
    const body = res.body as AuthRegisterResponseBody;
    tenantId = body.user.tenantId;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Template ──────────────────────────────────────
  describe('GET /contacts/import/template', () => {
    it('200 — retourne CSV template', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts/import/template')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('email');
      expect(res.text).toContain('firstName');
    });
  });

  // ── Import valide ─────────────────────────────────
  describe('POST /contacts/import', () => {
    it('200 — importe les contacts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', validCsv, {
          filename: 'contacts.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const body = res.body as ImportResponseBody;
      expect(body.imported).toBeGreaterThanOrEqual(2);
      expect(body.updated).toBe(0);
    });

    it('200 — idempotence (2ème import = updated)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', validCsv, {
          filename: 'contacts.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const body = res.body as ImportResponseBody;
      expect(body.imported).toBe(0);
    });

    it('200 — Fill Missing Only : ne pas écraser firstName', async () => {
      const email = `fill-${Date.now()}@test.com`;
      // Créer contact avec firstName via le mock prisma
      const contactCreate = prismaMock.contact.create as jest.Mock;
      await contactCreate({
        data: { tenantId, email, firstName: 'Original' },
      });

      const csv = Buffer.from(`email,firstName\n${email},Nouveau\n`);
      await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', csv, {
          filename: 'c.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const contactFindFirst = prismaMock.contact.findFirst as jest.Mock;
      const contact = (await contactFindFirst({
        where: { email, tenantId },
      })) as { firstName: string | null } | null;
      expect(contact?.firstName).toBe('Original');
    });

    it('200 — tags parsés en array', async () => {
      const email = `tags-${Date.now()}@test.com`;
      const csv = Buffer.from(`email,tags\n${email},"vip,actif"\n`);

      await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', csv, {
          filename: 'c.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const contactFindFirst = prismaMock.contact.findFirst as jest.Mock;
      const contact = (await contactFindFirst({
        where: { email, tenantId },
      })) as { properties: { tags?: string[] } | null } | null;
      const props = (contact?.properties ?? {}) as { tags?: string[] };
      expect(props.tags).toContain('vip');
      expect(props.tags).toContain('actif');
    });

    it('200 ??? remonte les lignes invalides dans errors', async () => {
      const email = `mixed-${Date.now()}@test.com`;
      const csv = Buffer.from(
        `email,firstName\ninvalid-email,Bad\n${email},Valid\n`,
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', csv, {
          filename: 'mixed.csv',
          contentType: 'text/csv',
        })
        .expect(200);

      const body = res.body as ImportResponseBody;
      expect(body.imported).toBeGreaterThanOrEqual(1);
      expect(body.skipped).toBe(1);
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0]).toContain('email invalide');
    });

    it('400 — colonne email absente', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .set('Cookie', cookies)
        .attach('file', csvWithoutEmail, {
          filename: 'bad.csv',
          contentType: 'text/csv',
        })
        .expect(400);
    });

    it('401 — sans token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts/import')
        .attach('file', validCsv, {
          filename: 'c.csv',
          contentType: 'text/csv',
        })
        .expect(401);
    });
  });
});
