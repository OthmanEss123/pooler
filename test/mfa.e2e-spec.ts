/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { generate, generateSecret, generateURI, verify } from 'otplib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClickhouseService } from '../src/database/clickhouse/clickhouse.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { MfaService } from '../src/modules/auth/services/mfa.service';
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

describe('MFA (e2e)', () => {
  let app: INestApplication<Server>;
  let cookies: string[] = [];
  let userId = '';

  const prismaMock = createPrismaMock() as any;

  let storedSecret: string | null = null;
  let mfaEnabledFlag = false;

  const mfaServiceMock = {
    generateSecret: jest.fn((uid: string) => {
      const secret = generateSecret();
      storedSecret = secret;
      mfaEnabledFlag = false;
      const otpauth = generateURI({
        issuer: 'Pilot',
        label: `user-${uid}`,
        secret,
      });
      return Promise.resolve({
        qrCodeUrl: `data:image/png;base64,${Buffer.from(otpauth).toString('base64')}`,
      });
    }),

    enable: jest.fn(async (_uid: string, token: string) => {
      if (!storedSecret) {
        throw new UnauthorizedException('MFA not initialized');
      }
      const result = await verify({ token, secret: storedSecret });
      if (!result.valid) {
        throw new UnauthorizedException('Invalid TOTP');
      }
      mfaEnabledFlag = true;
      return { enabled: true };
    }),

    disable: jest.fn(async (_uid: string, token: string, password: string) => {
      if (!storedSecret) {
        throw new UnauthorizedException('MFA not initialized');
      }
      if (password !== 'Password123!') {
        throw new UnauthorizedException('Invalid password');
      }
      const result = await verify({ token, secret: storedSecret });
      if (!result.valid) {
        throw new UnauthorizedException('Invalid TOTP');
      }
      storedSecret = null;
      mfaEnabledFlag = false;
      return { disabled: true };
    }),

    verifyToken: jest.fn(async (_uid: string, token: string) => {
      if (!storedSecret) {
        return false;
      }
      const result = await verify({ token, secret: storedSecret });
      return result.valid;
    }),
  };

  const owner = {
    tenantName: 'MFA Corp',
    tenantSlug: 'mfa-corp',
    email: 'mfa-owner@example.com',
    password: 'Password123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(ClickhouseService)
      .useValue({ isHealthy: jest.fn().mockResolvedValue(true) })
      .overrideProvider(MfaService)
      .useValue(mfaServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner)
      .expect(201);

    userId = registerResponse.body.user.id as string;
    cookies = toCookieHeader(registerResponse.headers['set-cookie']);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    storedSecret = null;
    mfaEnabledFlag = false;
    mfaServiceMock.generateSecret.mockClear();
    mfaServiceMock.enable.mockClear();
    mfaServiceMock.disable.mockClear();
    mfaServiceMock.verifyToken.mockClear();
  });

  describe('POST /auth/mfa/setup', () => {
    it('200 - retourne un QR code', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      expect(response.body.qrCodeUrl).toContain('data:image/png;base64,');
      expect(mfaServiceMock.generateSecret).toHaveBeenCalledWith(userId);
      expect(storedSecret).not.toBeNull();
    });

    it('401 - sans cookie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .expect(401);
    });
  });

  describe('POST /auth/mfa/enable', () => {
    it('200 - active la MFA avec un code TOTP valide', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      const validToken = await generate({ secret: storedSecret as string });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', cookies)
        .send({ token: validToken })
        .expect(200);

      expect(response.body).toEqual({ enabled: true });
      expect(mfaEnabledFlag).toBe(true);
    });

    it('401 - rejette un code TOTP invalide', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', cookies)
        .send({ token: '000000' })
        .expect(401);

      expect(mfaEnabledFlag).toBe(false);
    });
  });

  describe('POST /auth/mfa/verify (login flow)', () => {
    it('200 - second facteur valide -> retourne user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      const validToken = await generate({ secret: storedSecret as string });
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', cookies)
        .send({ token: validToken })
        .expect(200);

      const updateUser = prismaMock.user.update as jest.Mock;
      await updateUser({
        where: { id: userId },
        data: { mfaEnabled: true },
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(200);

      expect(loginResponse.body.requiresMfa).toBe(true);
      const mfaTempToken = loginResponse.body.mfaTempToken as string;
      expect(typeof mfaTempToken).toBe('string');

      const newCode = await generate({ secret: storedSecret as string });
      const verifyResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaTempToken, totpCode: newCode })
        .expect(200);

      expect(verifyResponse.body.user.id).toBe(userId);
    });

    it('401 - mfaTempToken invalide', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaTempToken: 'not-a-valid-token', totpCode: '123456' })
        .expect(401);
    });
  });

  describe('POST /auth/mfa/disable', () => {
    it('200 - desactive la MFA avec mot de passe + code TOTP valides', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      const enableToken = await generate({ secret: storedSecret as string });
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', cookies)
        .send({ token: enableToken })
        .expect(200);

      const disableToken = await generate({ secret: storedSecret as string });
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', cookies)
        .send({ token: disableToken, password: owner.password })
        .expect(200);

      expect(response.body).toEqual({ disabled: true });
      expect(storedSecret).toBeNull();
      expect(mfaEnabledFlag).toBe(false);
    });

    it('401 - mauvais mot de passe', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Cookie', cookies)
        .expect(200);

      const enableToken = await generate({ secret: storedSecret as string });
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', cookies)
        .send({ token: enableToken })
        .expect(200);

      const disableToken = await generate({ secret: storedSecret as string });
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', cookies)
        .send({ token: disableToken, password: 'WrongPassword!' })
        .expect(401);
    });
  });
});
