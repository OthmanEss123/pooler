/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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

describe('Auth verification and invitations (e2e)', () => {
  let app: INestApplication<Server>;
  let ownerCookies: string[] = [];
  let ownerTenantId = '';

  const prismaMock = createPrismaMock() as any;

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

  it('registers an owner, resends verification, and verifies the email', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Verification Corp',
        tenantSlug: 'verification-corp',
        email: 'owner@verification.test',
        password: 'Password123!',
        firstName: 'Owner',
        lastName: 'User',
      })
      .expect(201);

    expect(registerResponse.body.user.emailVerified).toBe(false);
    ownerTenantId = registerResponse.body.tenant.id as string;
    ownerCookies = toCookieHeader(
      registerResponse.headers['set-cookie'] as unknown as string[],
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .set('Cookie', ownerCookies)
      .expect(201)
      .expect({ sent: true });

    const ownerUser = Array.from(prismaMock.__stores.users.values()).find(
      (candidate: any) => candidate.email === 'owner@verification.test',
    ) as any;
    expect(ownerUser?.verifyToken).toBeTruthy();

    const verifyResponse = await request(app.getHttpServer())
      .get(`/api/v1/auth/verify-email?token=${ownerUser?.verifyToken ?? ''}`)
      .expect(200);

    expect(verifyResponse.body).toMatchObject({
      verified: true,
      email: 'owner@verification.test',
    });

    const verifiedUser = Array.from(prismaMock.__stores.users.values()).find(
      (candidate: any) => candidate.email === 'owner@verification.test',
    ) as any;

    expect(verifiedUser).toEqual(
      expect.objectContaining({
        emailVerified: true,
        verifyToken: null,
      }),
    );
  });

  it('creates an invitation, exposes it to the owner, and returns requiresAccount for public accept', async () => {
    const inviteResponse = await request(app.getHttpServer())
      .post('/api/v1/tenants/me/members')
      .set('Cookie', ownerCookies)
      .send({
        email: 'invitee@verification.test',
        role: 'ADMIN',
      })
      .expect(201);

    expect(inviteResponse.body).toMatchObject({
      invited: true,
      pending: true,
      email: 'invitee@verification.test',
      role: 'ADMIN',
    });

    const invitationsResponse = await request(app.getHttpServer())
      .get('/api/v1/tenants/me/invitations')
      .set('Cookie', ownerCookies)
      .expect(200);

    expect(invitationsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'invitee@verification.test',
          role: 'ADMIN',
        }),
      ]),
    );

    const invitation = (
      prismaMock.__stores.invitationTokens as Array<any>
    ).find((candidate: any) => candidate.email === 'invitee@verification.test');
    expect(invitation).toBeDefined();

    const acceptResponse = await request(app.getHttpServer())
      .get(`/api/v1/auth/accept-invite?token=${invitation?.token ?? ''}`)
      .expect(200);

    expect(acceptResponse.body).toMatchObject({
      requiresAccount: true,
      email: 'invitee@verification.test',
      tenantName: 'Verification Corp',
      role: 'ADMIN',
    });
  });

  it('registers an invited user with inviteToken and marks the invitation as used', async () => {
    const invitation = (
      prismaMock.__stores.invitationTokens as Array<any>
    ).find((candidate: any) => candidate.email === 'invitee@verification.test');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'invitee@verification.test',
        password: 'Password123!',
        firstName: 'Invited',
        lastName: 'Member',
        inviteToken: invitation?.token,
      })
      .expect(201);

    expect(response.body.user).toMatchObject({
      email: 'invitee@verification.test',
      role: 'ADMIN',
    });
    expect(response.body.tenant.id).toBe(ownerTenantId);
    expect(invitation?.usedAt).toBeInstanceOf(Date);
  });
});
