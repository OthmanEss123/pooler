import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma/prisma.service';

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
  let prisma: PrismaService;
  let cookies: string[];
  let tenantId: string;

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
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    prisma = module.get(PrismaService);
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
    cookies = res.headers['set-cookie'] as unknown as string[];
    const body = res.body as AuthRegisterResponseBody;
    tenantId = body.user.tenantId;
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({
      where: { tenantId },
    });
    await prisma.membership.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { email: owner.email } });
    await prisma.tenant.deleteMany({ where: { slug: owner.tenantSlug } });
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
      // Créer contact avec firstName
      await prisma.contact.create({
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

      const contact = await prisma.contact.findFirst({
        where: { email, tenantId },
      });
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

      const contact = await prisma.contact.findFirst({
        where: { email, tenantId },
      });
      const props = (contact?.properties ?? {}) as { tags?: string[] };
      expect(props.tags).toContain('vip');
      expect(props.tags).toContain('actif');
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
